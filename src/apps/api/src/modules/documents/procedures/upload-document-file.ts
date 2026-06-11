import type { Context } from "hono";

import type { SessionPayload } from "@kb/auth";

import type { ApiEnv } from "../../../contracts";
import {
  createSuccessResponse,
  respondWithError,
  respondWithServiceError,
} from "../../../http";
import {
  getRequestIpSummary,
  toKnowledgeActor,
} from "../../../guards";
import { getDocumentUploadContext } from "../../../middleware";
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
  return handleReservedUpload(
    context,
    dependencies,
    getDocumentUploadContext(context),
  );
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
