import { describe, expect, it } from "vitest";

import { apiErrorResponseSchema } from "@kb/shared";

import { createApiApp } from "../../../../../app";
import {
  adminSession,
  createFile,
  createStaticAuthService,
  createUploadHeaders,
  createUploadRequest,
  uploadConfig,
} from "../support/test-helpers";

describe("document upload API validation", () => {
  it("rejects missing content length before multipart parsing reaches the service", async () => {
    let serviceCalled = false;
    const app = createApiApp({
      authService: createStaticAuthService(adminSession),
      documentService: {
        async uploadDocumentFile() {
          serviceCalled = true;
          throw new Error("document service should not run");
        },
      },
      uploadConfig,
    });

    const response = await app.request(
      "/api/knowledge-bases/kb_1/documents/upload",
      createUploadRequest({
        file: createFile("%PDF-1.4\nhello", "policy.pdf", "application/pdf"),
        requestId: "req_upload_no_length",
      }),
    );

    expect(response.status).toBe(400);
    expect(apiErrorResponseSchema.parse(await response.json())).toMatchObject({
      code: "VALIDATION_ERROR",
    });
    expect(serviceCalled).toBe(false);
  });

  it("rejects multiple file parts", async () => {
    const app = createApiApp({
      authService: createStaticAuthService(adminSession),
      documentService: {
        async uploadDocumentFile() {
          throw new Error("document service should not run for invalid multipart");
        },
      },
      uploadConfig,
    });
    const formData = new FormData();
    formData.append(
      "file",
      createFile("%PDF-1.4\nhello", "first.pdf", "application/pdf"),
    );
    formData.append("extra", createFile("hello", "second.txt", "text/plain"));

    const response = await app.request(
      "/api/knowledge-bases/kb_1/documents/upload",
      {
        body: formData,
        headers: createUploadHeaders({
          contentLength: "400",
          requestId: "req_upload_multi_file",
        }),
        method: "POST",
      },
    );

    expect(response.status).toBe(400);
    expect(apiErrorResponseSchema.parse(await response.json())).toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("rejects spoofed PDF signatures and writes a security audit event", async () => {
    const securityFailures: string[] = [];
    const app = createApiApp({
      auditService: {
        async recordDocumentUploadSecurityFailure(input) {
          securityFailures.push(input.reason);
        },
        async recordForbiddenAdminAttempt() {
          throw new Error("not used");
        },
      },
      authService: createStaticAuthService(adminSession),
      documentService: {
        async uploadDocumentFile() {
          throw new Error("document service should not run for spoofed files");
        },
      },
      uploadConfig,
    });

    const response = await app.request(
      "/api/knowledge-bases/kb_1/documents/upload",
      createUploadRequest({
        contentLength: "300",
        file: createFile("not a pdf", "policy.pdf", "application/pdf"),
        requestId: "req_upload_spoofed",
      }),
    );

    expect(response.status).toBe(400);
    expect(apiErrorResponseSchema.parse(await response.json())).toMatchObject({
      code: "VALIDATION_ERROR",
    });
    expect(securityFailures).toEqual(["spoofed_file_signature"]);
  });
});
