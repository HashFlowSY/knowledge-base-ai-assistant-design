import { describe, expect, it } from "vitest";

import { createIngestionJobId, ingestionJobPayloadSchema } from "./index";

describe("@kb/queue", () => {
  it("creates stable ingestion job ids", () => {
    const payload = ingestionJobPayloadSchema.parse({
      type: "file_ingestion",
      tenantId: "tenant_1",
      knowledgeBaseId: "kb_1",
      documentId: "doc_1",
      documentVersion: "v1",
      sourceObjectKey: "tenants/tenant_1/documents/doc_1/source.pdf",
      requestedBy: "user_1",
    });

    expect(createIngestionJobId(payload)).toBe("ingestion:tenant_1:doc_1:v1");
  });
});
