import { describe, expect, it } from "vitest";

import { createDocumentObjectKey } from "./index";

describe("@kb/storage", () => {
  it("creates server-owned document object keys", () => {
    expect(
      createDocumentObjectKey({
        tenantId: "tenant_1",
        documentId: "doc_1",
        fileName: "source.pdf",
      }),
    ).toBe("tenants/tenant_1/documents/doc_1/source.pdf");
  });

  it("normalizes unsafe filenames to a single object key segment", () => {
    expect(
      createDocumentObjectKey({
        tenantId: "tenant_1",
        documentId: "doc_1",
        fileName: "../../secrets/source report.pdf",
      }),
    ).toBe("tenants/tenant_1/documents/doc_1/source-report.pdf");
  });

  it("normalizes Windows-style paths and unicode compatibility characters", () => {
    expect(
      createDocumentObjectKey({
        tenantId: "tenant_1",
        documentId: "doc_1",
        fileName: String.raw`C:\uploads\ＦＩＮＡＬ report.md`,
      }),
    ).toBe("tenants/tenant_1/documents/doc_1/FINAL-report.md");
  });

  it("rejects filenames that cannot produce a safe object key segment", () => {
    expect(() =>
      createDocumentObjectKey({
        tenantId: "tenant_1",
        documentId: "doc_1",
        fileName: "\u0000",
      }),
    ).toThrow("Invalid object filename");
  });

  it("rejects dot-only filenames after normalization", () => {
    expect(() =>
      createDocumentObjectKey({
        tenantId: "tenant_1",
        documentId: "doc_1",
        fileName: "../...",
      }),
    ).toThrow("Invalid object filename");
  });
});
