export type SupportedUploadKind = "markdown" | "pdf" | "txt";

export type FileValidationFailureReason =
  | "empty_file"
  | "invalid_title"
  | "oversized_file"
  | "spoofed_file_signature"
  | "unsupported_file_type";

export interface ValidatedUploadFile {
  bytes: Uint8Array;
  kind: SupportedUploadKind;
  mimeType: string;
  originalFilename: string;
  sizeBytes: number;
  title: string;
}

export type FileValidationResult =
  | { ok: true; file: ValidatedUploadFile }
  | {
      ok: false;
      auditReason?: Extract<
        FileValidationFailureReason,
        "oversized_file" | "spoofed_file_signature" | "unsupported_file_type"
      >;
      message: string;
      reason: FileValidationFailureReason;
      status: 400 | 413 | 415;
    };

const markdownExtensions = new Set(["md", "markdown"]);
const markdownMimeTypes = new Set([
  "text/markdown",
  "text/x-markdown",
  "text/plain",
]);
const textMimeTypes = new Set(["text/plain"]);
const pdfMimeTypes = new Set(["application/pdf"]);
const allowedTextControlBytes = new Set([9, 10, 13]);
const maxTextControlCharacterRatio = 0.05;
const maxTitleLength = 500;

export async function validateUploadFile(input: {
  file: File;
  maxFileBytes: number;
  titleField: string | null;
}): Promise<FileValidationResult> {
  if (input.file.size <= 0) {
    return {
      ok: false,
      message: "上传文件不能为空。",
      reason: "empty_file",
      status: 400,
    };
  }

  if (input.file.size > input.maxFileBytes) {
    return {
      auditReason: "oversized_file",
      ok: false,
      message: "上传文件超过大小限制。",
      reason: "oversized_file",
      status: 413,
    };
  }

  const bytes = new Uint8Array(await input.file.arrayBuffer());
  if (bytes.byteLength > input.maxFileBytes) {
    return {
      auditReason: "oversized_file",
      ok: false,
      message: "上传文件超过大小限制。",
      reason: "oversized_file",
      status: 413,
    };
  }

  const typeResult = detectSupportedFileType({
    mimeType: input.file.type,
    originalFilename: input.file.name,
  });
  if (!typeResult.ok) {
    return {
      auditReason: "unsupported_file_type",
      ok: false,
      message: "仅支持 PDF、Markdown 或 TXT 文件。",
      reason: "unsupported_file_type",
      status: 415,
    };
  }

  if (!passesLightweightSignatureCheck(typeResult.kind, bytes)) {
    return {
      auditReason: "spoofed_file_signature",
      ok: false,
      message: "文件内容与声明类型不匹配。",
      reason: "spoofed_file_signature",
      status: 400,
    };
  }

  const title = normalizeUploadTitle({
    originalFilename: input.file.name,
    titleField: input.titleField,
  });
  if (title === null) {
    return {
      ok: false,
      message: "文档标题无效。",
      reason: "invalid_title",
      status: 400,
    };
  }

  return {
    file: {
      bytes,
      kind: typeResult.kind,
      mimeType: typeResult.mimeType,
      originalFilename: input.file.name,
      sizeBytes: bytes.byteLength,
      title,
    },
    ok: true,
  };
}

export function normalizeUploadTitle(input: {
  originalFilename: string;
  titleField: string | null;
}): string | null {
  const explicitTitle = input.titleField?.trim() ?? "";
  const fallbackTitle =
    explicitTitle.length > 0
      ? explicitTitle
      : stripFinalExtension(getFinalPathSegment(input.originalFilename)).trim();

  if (fallbackTitle.length === 0 || fallbackTitle.length > maxTitleLength) {
    return null;
  }

  return fallbackTitle;
}

function detectSupportedFileType(input: {
  mimeType: string;
  originalFilename: string;
}): { ok: true; kind: SupportedUploadKind; mimeType: string } | { ok: false } {
  const extension = getFileExtension(input.originalFilename);
  const mimeType = normalizeMimeType(input.mimeType);

  if (extension === "pdf" && pdfMimeTypes.has(mimeType)) {
    return { kind: "pdf", mimeType, ok: true };
  }

  if (markdownExtensions.has(extension) && markdownMimeTypes.has(mimeType)) {
    return { kind: "markdown", mimeType, ok: true };
  }

  if (extension === "txt" && textMimeTypes.has(mimeType)) {
    return { kind: "txt", mimeType, ok: true };
  }

  return { ok: false };
}

function passesLightweightSignatureCheck(
  kind: SupportedUploadKind,
  bytes: Uint8Array,
): boolean {
  if (kind === "pdf") {
    return (
      bytes.length >= 5 &&
      bytes[0] === 0x25 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x44 &&
      bytes[3] === 0x46 &&
      bytes[4] === 0x2d
    );
  }

  return passesTextSafetyCheck(bytes);
}

function passesTextSafetyCheck(bytes: Uint8Array): boolean {
  if (bytes.includes(0)) {
    return false;
  }

  let controlCharacterCount = 0;
  for (const byte of bytes) {
    if (byte < 32 && !allowedTextControlBytes.has(byte)) {
      controlCharacterCount += 1;
    }
  }

  return controlCharacterCount / bytes.length <= maxTextControlCharacterRatio;
}

function getFileExtension(fileName: string): string {
  const finalSegment = getFinalPathSegment(fileName);
  const dotIndex = finalSegment.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === finalSegment.length - 1) {
    return "";
  }

  return finalSegment.slice(dotIndex + 1).toLocaleLowerCase();
}

function stripFinalExtension(fileName: string): string {
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex <= 0) {
    return fileName;
  }

  return fileName.slice(0, dotIndex);
}

function getFinalPathSegment(fileName: string): string {
  return fileName.split(/[\\/]/).filter(Boolean).at(-1) ?? "";
}

function normalizeMimeType(mimeType: string): string {
  return mimeType.split(";")[0]?.trim().toLocaleLowerCase() ?? "";
}
