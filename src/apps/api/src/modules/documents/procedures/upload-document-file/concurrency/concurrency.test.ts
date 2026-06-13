import { describe, expect, it } from "vitest";

import { createApiApp } from "../../../../../app";
import {
  adminSession,
  createFile,
  createStaticAuthService,
  createUploadRequest,
  documentUploadPath,
  uploadConfig,
} from "../support/test-helpers";

describe("document upload API concurrency", () => {
  it("rejects actor concurrency exhaustion before multipart parsing reaches the service", async () => {
    let serviceCalled = false;
    const app = createApiApp({
      authService: createStaticAuthService(adminSession),
      documentService: {
        async uploadDocumentFile() {
          serviceCalled = true;
          throw new Error("document service should not run after concurrency limit");
        },
      },
      uploadConcurrencyLimiter: {
        acquire() {
          return { ok: false, scope: "actor" };
        },
      },
      uploadConfig,
    });

    const response = await app.request(
      documentUploadPath,
      createUploadRequest({
        contentLength: "300",
        file: createFile("%PDF-1.4\nhello", "policy.pdf", "application/pdf"),
        requestId: "req_upload_actor_busy",
      }),
    );

    expect(response.status).toBe(429);
    expect(serviceCalled).toBe(false);
  });
});
