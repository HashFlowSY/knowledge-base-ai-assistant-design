import { describe, expect, it } from "vitest";

import {
  createDocumentObjectKey,
  normalizeObjectMetadata,
  objectStorageConfigSchema,
} from "./index";

describe("@kb/storage", () => {
  it("creates server-owned document object keys", () => {
    expect(
      createDocumentObjectKey({
        tenantId: "tenant_1",
        knowledgeBaseId: "kb_1",
        documentId: "doc_1",
        documentVersion: 1,
        fileName: "source.pdf",
      }),
    ).toBe(
      "tenants/tenant_1/knowledge-bases/kb_1/documents/doc_1/versions/1/source/source.pdf",
    );
  });

  it("normalizes unsafe filenames to a single object key segment", () => {
    expect(
      createDocumentObjectKey({
        tenantId: "tenant_1",
        knowledgeBaseId: "kb_1",
        documentId: "doc_1",
        documentVersion: 1,
        fileName: "../../secrets/source report.pdf",
      }),
    ).toBe(
      "tenants/tenant_1/knowledge-bases/kb_1/documents/doc_1/versions/1/source/source-report.pdf",
    );
  });

  it("normalizes Windows-style paths and unicode compatibility characters", () => {
    expect(
      createDocumentObjectKey({
        tenantId: "tenant_1",
        knowledgeBaseId: "kb_1",
        documentId: "doc_1",
        documentVersion: 1,
        fileName: String.raw`C:\uploads\ＦＩＮＡＬ report.md`,
      }),
    ).toBe(
      "tenants/tenant_1/knowledge-bases/kb_1/documents/doc_1/versions/1/source/FINAL-report.md",
    );
  });

  it("rejects filenames that cannot produce a safe object key segment", () => {
    expect(() =>
      createDocumentObjectKey({
        tenantId: "tenant_1",
        knowledgeBaseId: "kb_1",
        documentId: "doc_1",
        documentVersion: 1,
        fileName: "\u0000",
      }),
    ).toThrow("Invalid object filename");
  });

  it("rejects dot-only filenames after normalization", () => {
    expect(() =>
      createDocumentObjectKey({
        tenantId: "tenant_1",
        knowledgeBaseId: "kb_1",
        documentId: "doc_1",
        documentVersion: 1,
        fileName: "../...",
      }),
    ).toThrow("Invalid object filename");
  });

  it("validates S3-compatible object storage configuration", () => {
    expect(
      objectStorageConfigSchema.parse({
        accessKeyId: "minioadmin",
        bucket: "kb-source",
        endpoint: "http://localhost:9000",
        secretAccessKey: "minioadmin",
      }),
    ).toMatchObject({
      bucket: "kb-source",
      forcePathStyle: true,
      region: "local",
    });
  });

  it("normalizes non-ASCII object metadata values for S3 headers", () => {
    expect(
      normalizeObjectMetadata({
        checksum: "sha256:abc",
        originalFilename: "反脆弱 .pdf",
      }),
    ).toEqual({
      checksum: "sha256:abc",
      originalFilename: "%E5%8F%8D%E8%84%86%E5%BC%B1%20.pdf",
    });
  });
});
