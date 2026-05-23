import { describe, expect, it } from "vitest";

import type { DocumentFileUploadResult } from "@kb/knowledge";

import {
  documentUploadAcceptedFileTypes,
  documentUploadMaxFileBytes,
  formatDocumentUploadSuccessNotice,
  toDocumentUploadApiErrorMessage,
  validateDocumentUploadInput,
} from "./workspace-upload-helpers";

const timestamp = "2026-05-23T07:00:00.000Z";

describe("workspace upload helpers", () => {
  it("accepts one supported file and trims the optional title", () => {
    const file = new File(["# Policy"], "policy.md", { type: "text/markdown" });

    expect(
      validateDocumentUploadInput({
        files: [file],
        title: "  Quarterly Policy  ",
      }),
    ).toEqual({
      file,
      ok: true,
      title: "Quarterly Policy",
    });
    expect(documentUploadAcceptedFileTypes).toContain(".pdf");
    expect(documentUploadAcceptedFileTypes).toContain("text/markdown");
  });

  it("rejects invalid file and title states before upload", () => {
    const validFile = new File(["hello"], "policy.txt", { type: "text/plain" });
    const oversizedFile = new File(
      [new Uint8Array(documentUploadMaxFileBytes + 1)],
      "huge.txt",
      { type: "text/plain" },
    );

    expect(validateDocumentUploadInput({ files: [], title: "" })).toMatchObject({
      code: "file_required",
      ok: false,
    });
    expect(
      validateDocumentUploadInput({
        files: [validFile, validFile],
        title: "",
      }),
    ).toMatchObject({ code: "too_many_files", ok: false });
    expect(
      validateDocumentUploadInput({
        files: [new File([""], "empty.txt", { type: "text/plain" })],
        title: "",
      }),
    ).toMatchObject({ code: "empty_file", ok: false });
    expect(
      validateDocumentUploadInput({ files: [oversizedFile], title: "" }),
    ).toMatchObject({ code: "file_too_large", ok: false });
    expect(
      validateDocumentUploadInput({
        files: [new File(["{}"], "data.json", { type: "application/json" })],
        title: "",
      }),
    ).toMatchObject({ code: "unsupported_file_type", ok: false });
    expect(
      validateDocumentUploadInput({
        files: [validFile],
        title: "x".repeat(501),
      }),
    ).toMatchObject({ code: "title_too_long", ok: false });
  });

  it("formats upload success notices from backend result fields", () => {
    expect(
      formatDocumentUploadSuccessNotice(createUploadResult({ duplicate: false })),
    ).toBe("文档「Quarterly Policy」已上传，处理任务已排队。");
    expect(
      formatDocumentUploadSuccessNotice(createUploadResult({ duplicate: true })),
    ).toBe("相同内容已存在，已使用文档「Quarterly Policy」。");
  });

  it("maps API error codes to stable upload failure copy", () => {
    expect(toDocumentUploadApiErrorMessage("PAYLOAD_TOO_LARGE")).toBe(
      "文件超过大小限制，请选择 8 MB 以内的文件。",
    );
    expect(toDocumentUploadApiErrorMessage("UNSUPPORTED_MEDIA_TYPE")).toBe(
      "仅支持上传 PDF、Markdown 或 TXT 文件。",
    );
    expect(toDocumentUploadApiErrorMessage("RATE_LIMITED")).toBe(
      "上传请求过于频繁，请稍后重试。",
    );
    expect(toDocumentUploadApiErrorMessage("UNKNOWN")).toBe(
      "文件上传失败，请稍后重试。",
    );
  });
});

function createUploadResult(input: { duplicate: boolean }): DocumentFileUploadResult {
  return {
    document: {
      createdAt: timestamp,
      currentVersion: 1,
      id: "doc_1",
      knowledgeBaseId: "kb_1",
      status: "pending",
      title: "Quarterly Policy",
      updatedAt: timestamp,
    },
    duplicate: input.duplicate,
    job: {
      createdAt: timestamp,
      documentId: "doc_1",
      id: "job_1",
      knowledgeBaseId: "kb_1",
      queuedAt: timestamp,
      sourceHash: "sha256:abc",
      sourceType: "file",
      status: "queued",
      updatedAt: timestamp,
    },
    source: {
      bucket: "kb-documents",
      documentId: "doc_1",
      id: "source_1",
      mimeType: "text/markdown",
      objectKey: "object-key",
      scanStatus: "not_scanned",
      sizeBytes: 8,
      sourceHash: "sha256:abc",
      sourceType: "file",
      sourceUri: "policy.md",
      uploadedAt: timestamp,
      uploadStatus: "available",
    },
  };
}
