import type { DocumentFileUploadResult } from "@kb/knowledge";

import { knowledgeCopy } from "../../copy/knowledge";

export const documentUploadMaxFileBytes = 8 * 1024 * 1024;
export const documentUploadAcceptedFileTypes =
  ".pdf,.md,.markdown,.txt,application/pdf,text/markdown,text/x-markdown,text/plain";

const documentUploadTitleMaxLength = 500;
const markdownExtensions = new Set(["md", "markdown"]);
const markdownMimeTypes = new Set([
  "text/markdown",
  "text/plain",
  "text/x-markdown",
]);
const pdfMimeTypes = new Set(["application/pdf"]);
const textMimeTypes = new Set(["text/plain"]);

export type DocumentUploadValidationCode =
  | "empty_file"
  | "file_required"
  | "file_too_large"
  | "title_too_long"
  | "too_many_files"
  | "unsupported_file_type";

export type DocumentUploadValidationResult =
  | { ok: true; file: File; title: string }
  | {
      ok: false;
      code: DocumentUploadValidationCode;
      message: string;
    };

export function validateDocumentUploadInput(input: {
  files: readonly File[];
  title: string;
}): DocumentUploadValidationResult {
  if (input.files.length === 0) {
    return {
      code: "file_required",
      message: knowledgeCopy.validation.fileRequired,
      ok: false,
    };
  }

  if (input.files.length > 1) {
    return {
      code: "too_many_files",
      message: knowledgeCopy.validation.singleFileOnly,
      ok: false,
    };
  }

  const file = input.files[0];
  if (file === undefined) {
    return {
      code: "file_required",
      message: knowledgeCopy.validation.fileRequired,
      ok: false,
    };
  }

  if (file.size <= 0) {
    return {
      code: "empty_file",
      message: knowledgeCopy.validation.emptyFile,
      ok: false,
    };
  }

  if (file.size > documentUploadMaxFileBytes) {
    return {
      code: "file_too_large",
      message: knowledgeCopy.validation.fileTooLarge,
      ok: false,
    };
  }

  if (!isSupportedDocumentUploadFile(file)) {
    return {
      code: "unsupported_file_type",
      message: knowledgeCopy.validation.unsupportedUploadFileType,
      ok: false,
    };
  }

  const title = input.title.trim();
  if (title.length > documentUploadTitleMaxLength) {
    return {
      code: "title_too_long",
      message: knowledgeCopy.validation.uploadTitleTooLong,
      ok: false,
    };
  }

  return { file, ok: true, title };
}

export function formatDocumentUploadSuccessNotice(
  result: DocumentFileUploadResult,
): string {
  if (result.duplicate) {
    return knowledgeCopy.uploadSuccess.duplicate(result.document.title);
  }

  if (result.job.status === "queued") {
    return knowledgeCopy.uploadSuccess.queued(result.document.title);
  }

  return knowledgeCopy.uploadSuccess.uploaded(result.document.title);
}

export function toDocumentUploadApiErrorMessage(code: string): string {
  switch (code) {
    case "CONFLICT":
      return knowledgeCopy.uploadErrors.conflict;
    case "FORBIDDEN":
      return knowledgeCopy.uploadErrors.forbidden;
    case "NOT_FOUND":
      return knowledgeCopy.uploadErrors.notFound;
    case "PAYLOAD_TOO_LARGE":
      return knowledgeCopy.uploadErrors.payloadTooLarge;
    case "RATE_LIMITED":
      return knowledgeCopy.uploadErrors.rateLimited;
    case "UNAUTHORIZED":
      return knowledgeCopy.uploadErrors.unauthorized;
    case "UNSUPPORTED_MEDIA_TYPE":
      return knowledgeCopy.uploadErrors.unsupportedMediaType;
    case "VALIDATION_ERROR":
      return knowledgeCopy.uploadErrors.validation;
    default:
      return knowledgeCopy.uploadErrors.generic;
  }
}

function isSupportedDocumentUploadFile(file: File): boolean {
  const extension = getFileExtension(file.name);
  const mimeType = normalizeMimeType(file.type);

  if (extension === "pdf") {
    return pdfMimeTypes.has(mimeType);
  }

  if (markdownExtensions.has(extension)) {
    return markdownMimeTypes.has(mimeType);
  }

  if (extension === "txt") {
    return textMimeTypes.has(mimeType);
  }

  return false;
}

function getFileExtension(fileName: string): string {
  const finalSegment = fileName.split(/[\\/]/).filter(Boolean).at(-1) ?? "";
  const dotIndex = finalSegment.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === finalSegment.length - 1) {
    return "";
  }

  return finalSegment.slice(dotIndex + 1).toLocaleLowerCase();
}

function normalizeMimeType(mimeType: string): string {
  return mimeType.split(";")[0]?.trim().toLocaleLowerCase() ?? "";
}
