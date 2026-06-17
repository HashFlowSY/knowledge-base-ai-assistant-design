import type { Context } from "hono";

import type { SessionPayload } from "@kb/auth";
import {
  payloadTooLarge,
  unsupportedMediaType,
  validationError,
  type AppError,
} from "@kb/errors";

import type { ApiEnv } from "../../../contracts";
import { createSuccessResponse } from "../../../http";
import {
  getRequestIpSummary,
  toKnowledgeActor,
} from "../../../guards";
import { getDocumentUploadContext } from "../../../middleware";
import {
  validateUploadFile,
  type FileValidationResult,
} from "../lib/file-validation";
import { recordUploadSecurityFailure } from "../lib/upload-audit";
import {
  createSha256Checksum,
  parseContentLength,
  parseMultipartUpload,
  type ContentLengthResult,
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

    throw createContentLengthAppError(contentLength);
  }

  let formData: FormData;
  try {
    formData = await context.req.raw.formData();
  } catch {
    throw validationError({
      domain: "api",
      reason: "invalid_multipart_form_data",
      message: "请提交有效的 multipart 表单。",
    });
  }

  const multipartResult = parseMultipartUpload(formData);
  if (!multipartResult.ok) {
    throw validationError({
      domain: "api",
      reason: "invalid_multipart_form_data",
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

    throw createUploadFileValidationAppError(validatedFile);
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

function createContentLengthAppError(
  result: Extract<ContentLengthResult, { ok: false }>,
): AppError {
  if (result.status === 413) {
    return payloadTooLarge({
      domain: "api",
      reason: "upload_request_too_large",
      message: result.message,
    });
  }

  return validationError({
    domain: "api",
    reason: "invalid_content_length",
    message: result.message,
  });
}

function createUploadFileValidationAppError(
  result: Extract<FileValidationResult, { ok: false }>,
): AppError {
  if (result.status === 413) {
    return payloadTooLarge({
      domain: "api",
      reason: "upload_file_too_large",
      message: result.message,
    });
  }

  if (result.status === 415) {
    return unsupportedMediaType({
      domain: "api",
      reason: "unsupported_upload_file_type",
      message: result.message,
    });
  }

  return validationError({
    domain: "api",
    reason: result.reason,
    message: result.message,
  });
}
