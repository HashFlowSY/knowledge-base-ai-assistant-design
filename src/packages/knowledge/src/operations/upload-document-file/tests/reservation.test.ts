import { describe, expect, it } from "vitest";

import { createIngestionJobReservationValues } from "../metadata/reservation";
import type { UploadInput } from "../shared/types";

describe("upload metadata reservation", () => {
  it("persists configured ingestion max attempts for new jobs", () => {
    const values = createIngestionJobReservationValues({
      documentId: "doc_1",
      input: uploadInput(),
      maxAttempts: 5,
      objectKey: "tenants/tenant_1/kb/kb_1/documents/doc_1/source.txt",
      sourceBucket: "kb-source",
      sourceId: "source_1",
    });

    expect(values).toMatchObject({
      documentId: "doc_1",
      knowledgeBaseId: "kb_1",
      maxAttempts: 5,
      requestedByUserId: "user_1",
      sourceHash: "sha256:abc",
      sourceType: "file",
      status: "pending_source",
      tenantId: "tenant_1",
    });
    expect(values.metadata).toMatchObject({
      bucket: "kb-source",
      objectKey: "tenants/tenant_1/kb/kb_1/documents/doc_1/source.txt",
      sourceId: "source_1",
    });
  });

  it("uses the database default when max attempts are not configured", () => {
    const values = createIngestionJobReservationValues({
      documentId: "doc_1",
      input: uploadInput(),
      objectKey: "tenants/tenant_1/kb/kb_1/documents/doc_1/source.txt",
      sourceBucket: "kb-source",
      sourceId: "source_1",
    });

    expect("maxAttempts" in values).toBe(false);
  });
});

function uploadInput(): UploadInput {
  return {
    actor: {
      role: "admin",
      tenant: { id: "tenant_1" },
      user: { id: "user_1" },
    },
    checksum: "sha256:abc",
    content: new Uint8Array([1, 2, 3]),
    ipSummary: "203.0.113.0/24",
    knowledgeBaseId: "kb_1",
    mimeType: "text/plain",
    originalFilename: "source.txt",
    requestId: "req_1",
    sizeBytes: 3,
    title: "Source",
    userAgentSummary: "vitest",
  };
}
