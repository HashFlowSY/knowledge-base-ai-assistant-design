import { describe, expect, it } from "vitest";

import type { ProjectDb } from "@kb/db";
import { createLogger, type LogRecord } from "@kb/observability";

import { logUploadFailure } from "../observability/audit";
import type { UploadInput } from "../shared/types";

describe("upload document observability", () => {
  it("logs upload failures without leaking raw error messages", () => {
    const records: LogRecord[] = [];
    const input = createUploadInput();

    logUploadFailure(
      {
        db: {} as ProjectDb,
        logger: createLogger({ service: "api" }, (record) => records.push(record)),
      },
      "document_upload_object_put_failed",
      input,
      {
        documentId: "document_1",
        error: new Error(
          "put failed for tenants/tenant_1/private.pdf token=secret_token requestBody={}",
        ),
        jobId: "job_1",
      },
    );

    expect(records).toContainEqual(
      expect.objectContaining({
        event: "document_upload_object_put_failed",
        fields: {
          actorId: "user_1",
          documentId: "document_1",
          error: "Document upload failed.",
          jobId: "job_1",
          knowledgeBaseId: "kb_1",
          requestId: "req_upload",
          tenantId: "tenant_1",
        },
      }),
    );
    expect(JSON.stringify(records)).not.toContain("private.pdf");
    expect(JSON.stringify(records)).not.toContain("secret_token");
    expect(JSON.stringify(records)).not.toContain("requestBody");
  });
});

function createUploadInput(): UploadInput {
  return {
    actor: {
      role: "admin",
      tenant: { id: "tenant_1" },
      user: { id: "user_1" },
    },
    checksum: "sha256:checksum",
    content: new Uint8Array([1, 2, 3]),
    ipSummary: "unknown",
    knowledgeBaseId: "kb_1",
    mimeType: "application/pdf",
    originalFilename: "private.pdf",
    requestId: "req_upload",
    sizeBytes: 3,
    title: "Private",
    userAgentSummary: null,
  };
}
