import type { Context } from "hono";

import type { SessionPayload } from "@kb/auth";
import { createLogger } from "@kb/observability";

import type { ApiEnv } from "../../../contracts";
import { createSuccessResponse } from "../../../http";
import { respondWithError } from "../../../http";
import {
  appendSetCookieHeaders,
  respondWithServiceError,
  validateMutationRequest,
} from "../../../request-helpers";
import {
  getRequestIpSummary,
  rateLimitDocumentUpload,
} from "../../../session-guards";
import { validateUploadFile } from "../lib/file-validation";
import type { DocumentsRouteDependencies } from "../types";

type ContentLengthResult =
  | { ok: true; value: number }
  | {
      ok: false;
      auditOversized: boolean;
      code: "PAYLOAD_TOO_LARGE" | "VALIDATION_ERROR";
      message: string;
      status: 400 | 413;
    };

const uploadLogger = createLogger({ service: "api" });

export async function uploadDocumentFileProcedure(
  context: Context<ApiEnv>,
  dependencies: DocumentsRouteDependencies,
): Promise<Response> {
  const mutationResponse = validateMutationRequest(
    context,
    dependencies.allowedOrigins,
  );
  if (mutationResponse !== null) {
    return mutationResponse;
  }

  const contentType = context.req.header("content-type");
  if (
    contentType === undefined ||
    !contentType.toLocaleLowerCase().includes("multipart/form-data")
  ) {
    return respondWithError(context, {
      code: "UNSUPPORTED_MEDIA_TYPE",
      httpStatus: 415,
      message: "请使用 multipart/form-data 请求体。",
    });
  }

  const sessionResult = await dependencies.authService.getSession({
    cookieHeader: context.req.header("cookie") ?? null,
  });
  if (!sessionResult.ok) {
    appendSetCookieHeaders(context, sessionResult.setCookieHeaders);
    return respondWithError(context, {
      code: sessionResult.code,
      httpStatus: sessionResult.httpStatus,
      message: sessionResult.message,
    });
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
    actor: input.actor,
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

function parseContentLength(input: {
  maxRequestBytes: number;
  rawValue: string | null;
}): ContentLengthResult {
  if (input.rawValue === null || input.rawValue.trim().length === 0) {
    return {
      auditOversized: false,
      code: "VALIDATION_ERROR",
      message: "上传请求必须包含 Content-Length。",
      ok: false,
      status: 400,
    };
  }

  const parsed = Number(input.rawValue);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return {
      auditOversized: false,
      code: "VALIDATION_ERROR",
      message: "Content-Length 无效。",
      ok: false,
      status: 400,
    };
  }

  if (parsed > input.maxRequestBytes) {
    return {
      auditOversized: true,
      code: "PAYLOAD_TOO_LARGE",
      message: "上传请求超过大小限制。",
      ok: false,
      status: 413,
    };
  }

  return { ok: true, value: parsed };
}

function parseMultipartUpload(
  formData: FormData,
):
  | { ok: true; file: File; titleField: string | null }
  | { ok: false; message: string } {
  const files: File[] = [];
  let titleField: string | null = null;

  for (const [fieldName, value] of formData.entries()) {
    if (value instanceof File) {
      files.push(value);
      continue;
    }

    if (fieldName === "title") {
      titleField = value;
    }
  }

  if (files.length === 0) {
    return { message: "请上传一个文件。", ok: false };
  }

  if (files.length > 1) {
    return { message: "每次只能上传一个文件。", ok: false };
  }

  const file = files[0];
  if (file === undefined) {
    return { message: "请上传一个文件。", ok: false };
  }

  return { file, ok: true, titleField };
}

async function createSha256Checksum(bytes: Uint8Array): Promise<string> {
  const data = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(data).set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const hex = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  return `sha256:${hex}`;
}

async function recordUploadSecurityFailure(
  context: Context<ApiEnv>,
  dependencies: DocumentsRouteDependencies,
  actor: SessionPayload,
  input: {
    metadata: Record<string, unknown>;
    knowledgeBaseId: string;
    reason: "oversized_file" | "spoofed_file_signature" | "unsupported_file_type";
  },
): Promise<void> {
  try {
    await dependencies.auditService.recordDocumentUploadSecurityFailure({
      actor,
      ipSummary: getRequestIpSummary(context),
      knowledgeBaseId: input.knowledgeBaseId,
      metadata: input.metadata,
      reason: input.reason,
      requestId: context.get("requestId"),
      userAgentSummary: context.req.header("user-agent") ?? null,
    });
  } catch (error) {
    uploadLogger.error("document_upload_security_audit_failed", {
      error: error instanceof Error ? error.message : String(error),
      reason: input.reason,
      requestId: context.get("requestId"),
    });
  }
}
