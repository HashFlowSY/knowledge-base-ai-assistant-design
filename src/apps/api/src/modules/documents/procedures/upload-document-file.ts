import type { Context } from "hono";

import type { SessionPayload } from "@kb/auth";

import type { ApiEnv } from "../../../contracts";
import {
  appendSetCookieHeaders,
  createSuccessResponse,
  respondWithError,
  respondWithServiceError,
} from "../../../http";
import {
  getRequestIpSummary,
  rateLimitDocumentUpload,
  respondAfterUnresolvedDocumentUploadRateLimit,
  toKnowledgeActor,
  validateMutationRequest,
} from "../../../guards";
import { validateUploadFile } from "../lib/file-validation";
import { recordUploadSecurityFailure } from "../lib/upload-audit";
import {
  createSha256Checksum,
  parseContentLength,
  parseMultipartUpload,
} from "../lib/upload-request";
import type { DocumentsRouteDependencies } from "../dependencies";

export async function uploadDocumentFileProcedure(
  context: Context<ApiEnv>,
  dependencies: DocumentsRouteDependencies,
): Promise<Response> {
  const mutationResponse = validateMutationRequest(
    context,
    dependencies.allowedOrigins,
  );
  if (mutationResponse !== null) {
    return respondAfterUnresolvedDocumentUploadRateLimit(
      context,
      dependencies.rateLimiter,
      dependencies.uploadConfig.rateLimitPerMinute,
      mutationResponse,
    );
  }

  const contentType = context.req.header("content-type");
  if (
    contentType === undefined ||
    !contentType.toLocaleLowerCase().includes("multipart/form-data")
  ) {
    return respondAfterUnresolvedDocumentUploadRateLimit(
      context,
      dependencies.rateLimiter,
      dependencies.uploadConfig.rateLimitPerMinute,
      respondWithError(context, {
        code: "UNSUPPORTED_MEDIA_TYPE",
        httpStatus: 415,
        message: "请使用 multipart/form-data 请求体。",
      }),
    );
  }

  const sessionResult = await dependencies.authService.getSession({
    cookieHeader: context.req.header("cookie") ?? null,
  });
  if (!sessionResult.ok) {
    appendSetCookieHeaders(context, sessionResult.setCookieHeaders);
    return respondAfterUnresolvedDocumentUploadRateLimit(
      context,
      dependencies.rateLimiter,
      dependencies.uploadConfig.rateLimitPerMinute,
      respondWithError(context, {
        code: sessionResult.code,
        httpStatus: sessionResult.httpStatus,
        message: sessionResult.message,
      }),
    );
  }

  const actor = sessionResult.payload;
  const knowledgeBaseId = context.req.param("knowledgeBaseId");
  if (knowledgeBaseId === undefined || knowledgeBaseId.length === 0) {
    return respondWithError(context, {
      code: "VALIDATION_ERROR",
      httpStatus: 400,
      message: "知识库参数无效。",
    });
  }

  const rateLimitResponse = await rateLimitDocumentUpload(
    context,
    dependencies.rateLimiter,
    actor,
    dependencies.uploadConfig.rateLimitPerMinute,
  );
  if (rateLimitResponse !== null) {
    return rateLimitResponse;
  }

  const reservationResult = dependencies.uploadConcurrencyLimiter.acquire({
    actorKey: `${actor.tenant.id}:${actor.user.id}`,
    actorLimit: dependencies.uploadConfig.concurrencyPerActor,
    tenantKey: actor.tenant.id,
    tenantLimit: dependencies.uploadConfig.concurrencyPerTenant,
  });
  if (!reservationResult.ok) {
    return respondWithError(context, {
      code: "RATE_LIMITED",
      httpStatus: 429,
      message:
        reservationResult.scope === "actor"
          ? "当前账号上传任务过多，请稍后重试。"
          : "当前租户上传任务过多，请稍后重试。",
    });
  }

  try {
    return await handleReservedUpload(context, dependencies, {
      actor,
      knowledgeBaseId,
    });
  } finally {
    reservationResult.reservation.release();
  }
}

async function handleReservedUpload(
  context: Context<ApiEnv>,
  dependencies: DocumentsRouteDependencies,
  input: { actor: SessionPayload; knowledgeBaseId: string },
): Promise<Response> {
  const contentLength = parseContentLength({
    maxRequestBytes:
      dependencies.uploadConfig.maxFileBytes +
      dependencies.uploadConfig.requestOverheadBytes,
    rawValue: context.req.header("content-length") ?? null,
  });
  if (!contentLength.ok) {
    if (contentLength.auditOversized) {
      await recordUploadSecurityFailure(context, dependencies, input.actor, {
        metadata: {
          contentLength: context.req.header("content-length") ?? null,
          maxFileBytes: dependencies.uploadConfig.maxFileBytes,
        },
        reason: "oversized_file",
        knowledgeBaseId: input.knowledgeBaseId,
      });
    }

    return respondWithError(context, {
      code: contentLength.code,
      httpStatus: contentLength.status,
      message: contentLength.message,
    });
  }

  let formData: FormData;
  try {
    formData = await context.req.raw.formData();
  } catch {
    return respondWithError(context, {
      code: "VALIDATION_ERROR",
      httpStatus: 400,
      message: "请提交有效的 multipart 表单。",
    });
  }

  const multipartResult = parseMultipartUpload(formData);
  if (!multipartResult.ok) {
    return respondWithError(context, {
      code: "VALIDATION_ERROR",
      httpStatus: 400,
      message: multipartResult.message,
    });
  }

  const validatedFile = await validateUploadFile({
    file: multipartResult.file,
    maxFileBytes: dependencies.uploadConfig.maxFileBytes,
    titleField: multipartResult.titleField,
  });
  if (!validatedFile.ok) {
    if (validatedFile.auditReason !== undefined) {
      await recordUploadSecurityFailure(context, dependencies, input.actor, {
        metadata: {
          fileName: multipartResult.file.name,
          fileSize: multipartResult.file.size,
          mimeType: multipartResult.file.type,
        },
        reason: validatedFile.auditReason,
        knowledgeBaseId: input.knowledgeBaseId,
      });
    }

    return respondWithError(context, {
      code:
        validatedFile.status === 413
          ? "PAYLOAD_TOO_LARGE"
          : validatedFile.status === 415
            ? "UNSUPPORTED_MEDIA_TYPE"
            : "VALIDATION_ERROR",
      httpStatus: validatedFile.status,
      message: validatedFile.message,
    });
  }

  const checksum = await createSha256Checksum(validatedFile.file.bytes);
  const serviceResult = await dependencies.documentService.uploadDocumentFile({
    actor: toKnowledgeActor(input.actor),
    checksum,
    content: validatedFile.file.bytes,
    ipSummary: getRequestIpSummary(context),
    knowledgeBaseId: input.knowledgeBaseId,
    mimeType: validatedFile.file.mimeType,
    originalFilename: validatedFile.file.originalFilename,
    requestId: context.get("requestId"),
    sizeBytes: validatedFile.file.sizeBytes,
    title: validatedFile.file.title,
    userAgentSummary: context.req.header("user-agent") ?? null,
  });
  if (!serviceResult.ok) {
    return respondWithServiceError(context, serviceResult);
  }

  const status = serviceResult.result.duplicate ? 200 : 201;
  return context.json(
    createSuccessResponse({
      data: serviceResult.result,
      httpStatus: status,
      requestId: context.get("requestId"),
    }),
    status,
  );
}
