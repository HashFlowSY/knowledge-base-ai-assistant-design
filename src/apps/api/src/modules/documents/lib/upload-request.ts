export type ContentLengthResult =
  | { ok: true; value: number }
  | {
      ok: false;
      auditOversized: boolean;
      code: "PAYLOAD_TOO_LARGE" | "VALIDATION_ERROR";
      message: string;
      status: 400 | 413;
    };

export function parseContentLength(input: {
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

export function parseMultipartUpload(
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

export async function createSha256Checksum(bytes: Uint8Array): Promise<string> {
  const data = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(data).set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const hex = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  return `sha256:${hex}`;
}
