import { describe, expect, it } from "vitest";

import { createLogger, type LogRecord } from "@kb/observability";
import { apiErrorResponseSchema } from "@kb/shared";

import { createApiApp } from "../../../../../app";
import type { RateLimitConsumeInput } from "../../../../../rate-limit";
import {
  adminSession,
  createFile,
  createStaticAuthService,
  createUploadHeaders,
  createUploadRequest,
  documentUploadPath,
  uploadConfig,
} from "../support/test-helpers";

describe("document upload API validation", () => {
  it("rejects missing content length before multipart parsing reaches the service", async () => {
    let serviceCalled = false;
    const records: LogRecord[] = [];
    const app = createApiApp({
      authService: createStaticAuthService(adminSession),
      documentService: {
        async uploadDocumentFile() {
          serviceCalled = true;
          throw new Error("document service should not run");
        },
      },
      logger: createLogger({ service: "api" }, (record) => records.push(record)),
      uploadConfig,
    });

    const response = await app.request(
      documentUploadPath,
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
    expect(records).toContainEqual(
      expect.objectContaining({
        event: "api_request_app_error",
        fields: expect.objectContaining({
          code: "VALIDATION_ERROR",
          domain: "api",
          reason: "invalid_content_length",
        }),
        level: "error",
      }),
    );
  });

  it("rejects oversized upload requests before multipart parsing reaches the service", async () => {
    let serviceCalled = false;
    const securityFailures: string[] = [];
    const records: LogRecord[] = [];
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
          serviceCalled = true;
          throw new Error("document service should not run for oversized requests");
        },
      },
      logger: createLogger({ service: "api" }, (record) => records.push(record)),
      uploadConfig,
    });

    const response = await app.request(
      documentUploadPath,
      createUploadRequest({
        contentLength: "2000",
        file: createFile("%PDF-1.4\nhello", "policy.pdf", "application/pdf"),
        requestId: "req_upload_request_too_large",
      }),
    );

    expect(response.status).toBe(413);
    expect(apiErrorResponseSchema.parse(await response.json())).toMatchObject({
      code: "PAYLOAD_TOO_LARGE",
      httpStatus: 413,
    });
    expect(serviceCalled).toBe(false);
    expect(securityFailures).toEqual(["oversized_file"]);
    expect(records).toContainEqual(
      expect.objectContaining({
        event: "api_request_app_error",
        fields: expect.objectContaining({
          code: "PAYLOAD_TOO_LARGE",
          domain: "api",
          reason: "upload_request_too_large",
        }),
      }),
    );
  });

  it("rejects non-UUID knowledge base path params before upload service calls", async () => {
    const consumedInputs: RateLimitConsumeInput[] = [];
    let serviceCalled = false;
    const app = createApiApp({
      authService: createStaticAuthService(adminSession),
      documentService: {
        async uploadDocumentFile() {
          serviceCalled = true;
          throw new Error("document service should not run for invalid params");
        },
      },
      rateLimiter: {
        async consume(input) {
          consumedInputs.push(input);
          return { allowed: true, retryAfterSeconds: 60 };
        },
      },
      uploadConfig,
    });

    const response = await app.request(
      "/api/knowledge-bases/not-a-uuid/documents/upload",
      createUploadRequest({
        contentLength: "300",
        file: createFile("%PDF-1.4\nhello", "policy.pdf", "application/pdf"),
        requestId: "req_upload_invalid_kb_param",
      }),
    );

    expect(response.status).toBe(400);
    expect(apiErrorResponseSchema.parse(await response.json())).toMatchObject({
      code: "VALIDATION_ERROR",
      httpStatus: 400,
      requestId: "req_upload_invalid_kb_param",
    });
    expect(serviceCalled).toBe(false);
    expect(consumedInputs).toHaveLength(1);
    expect(consumedInputs[0]).toMatchObject({
      identity: "tenant:tenant_1:actor:admin_1",
      limit: 20,
      scope: "document-upload",
      windowLabel: "1m",
    });
  });

  it("rejects multiple file parts", async () => {
    const records: LogRecord[] = [];
    const app = createApiApp({
      authService: createStaticAuthService(adminSession),
      documentService: {
        async uploadDocumentFile() {
          throw new Error("document service should not run for invalid multipart");
        },
      },
      logger: createLogger({ service: "api" }, (record) => records.push(record)),
      uploadConfig,
    });
    const formData = new FormData();
    formData.append(
      "file",
      createFile("%PDF-1.4\nhello", "first.pdf", "application/pdf"),
    );
    formData.append("extra", createFile("hello", "second.txt", "text/plain"));

    const response = await app.request(
      documentUploadPath,
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
    expect(records).toContainEqual(
      expect.objectContaining({
        event: "api_request_app_error",
        fields: expect.objectContaining({
          code: "VALIDATION_ERROR",
          domain: "api",
          reason: "invalid_multipart_form_data",
        }),
        level: "error",
      }),
    );
  });

  it("rejects invalid raw multipart bodies before upload service calls", async () => {
    let serviceCalled = false;
    const records: LogRecord[] = [];
    const app = createApiApp({
      authService: createStaticAuthService(adminSession),
      documentService: {
        async uploadDocumentFile() {
          serviceCalled = true;
          throw new Error("document service should not run for invalid multipart");
        },
      },
      logger: createLogger({ service: "api" }, (record) => records.push(record)),
      uploadConfig,
    });

    const response = await app.request(
      documentUploadPath,
      {
        body: "not a valid multipart payload",
        headers: {
          ...createUploadHeaders({
            contentLength: "32",
            requestId: "req_upload_invalid_raw_multipart",
          }),
          "content-type": "multipart/form-data; boundary=invalid-boundary",
        },
        method: "POST",
      },
    );

    expect(response.status).toBe(400);
    expect(apiErrorResponseSchema.parse(await response.json())).toMatchObject({
      code: "VALIDATION_ERROR",
      httpStatus: 400,
    });
    expect(serviceCalled).toBe(false);
    expect(records).toContainEqual(
      expect.objectContaining({
        event: "api_request_app_error",
        fields: expect.objectContaining({
          code: "VALIDATION_ERROR",
          domain: "api",
          reason: "invalid_multipart_form_data",
        }),
      }),
    );
  });

  it("rejects empty upload files before upload service calls", async () => {
    let serviceCalled = false;
    const records: LogRecord[] = [];
    const app = createApiApp({
      authService: createStaticAuthService(adminSession),
      documentService: {
        async uploadDocumentFile() {
          serviceCalled = true;
          throw new Error("document service should not run for empty files");
        },
      },
      logger: createLogger({ service: "api" }, (record) => records.push(record)),
      uploadConfig,
    });

    const response = await app.request(
      documentUploadPath,
      createUploadRequest({
        contentLength: "200",
        file: createFile("", "empty.txt", "text/plain"),
        requestId: "req_upload_empty_file",
      }),
    );

    expect(response.status).toBe(400);
    expect(apiErrorResponseSchema.parse(await response.json())).toMatchObject({
      code: "VALIDATION_ERROR",
      httpStatus: 400,
    });
    expect(serviceCalled).toBe(false);
    expect(records).toContainEqual(
      expect.objectContaining({
        event: "api_request_app_error",
        fields: expect.objectContaining({
          code: "VALIDATION_ERROR",
          domain: "api",
          reason: "empty_file",
        }),
      }),
    );
  });

  it("rejects upload files with invalid titles before upload service calls", async () => {
    let serviceCalled = false;
    const records: LogRecord[] = [];
    const app = createApiApp({
      authService: createStaticAuthService(adminSession),
      documentService: {
        async uploadDocumentFile() {
          serviceCalled = true;
          throw new Error("document service should not run for invalid titles");
        },
      },
      logger: createLogger({ service: "api" }, (record) => records.push(record)),
      uploadConfig,
    });

    const response = await app.request(
      documentUploadPath,
      createUploadRequest({
        contentLength: "300",
        file: createFile("plain text", "notes.txt", "text/plain"),
        requestId: "req_upload_invalid_title",
        title: "a".repeat(501),
      }),
    );

    expect(response.status).toBe(400);
    expect(apiErrorResponseSchema.parse(await response.json())).toMatchObject({
      code: "VALIDATION_ERROR",
      httpStatus: 400,
    });
    expect(serviceCalled).toBe(false);
    expect(records).toContainEqual(
      expect.objectContaining({
        event: "api_request_app_error",
        fields: expect.objectContaining({
          code: "VALIDATION_ERROR",
          domain: "api",
          reason: "invalid_title",
        }),
      }),
    );
  });

  it("rejects oversized upload files before upload service calls", async () => {
    let serviceCalled = false;
    const securityFailures: string[] = [];
    const records: LogRecord[] = [];
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
          serviceCalled = true;
          throw new Error("document service should not run for oversized files");
        },
      },
      logger: createLogger({ service: "api" }, (record) => records.push(record)),
      uploadConfig,
    });

    const response = await app.request(
      documentUploadPath,
      createUploadRequest({
        contentLength: "1100",
        file: createFile("a".repeat(1025), "large.txt", "text/plain"),
        requestId: "req_upload_file_too_large",
      }),
    );

    expect(response.status).toBe(413);
    expect(apiErrorResponseSchema.parse(await response.json())).toMatchObject({
      code: "PAYLOAD_TOO_LARGE",
      httpStatus: 413,
    });
    expect(serviceCalled).toBe(false);
    expect(securityFailures).toEqual(["oversized_file"]);
    expect(records).toContainEqual(
      expect.objectContaining({
        event: "api_request_app_error",
        fields: expect.objectContaining({
          code: "PAYLOAD_TOO_LARGE",
          domain: "api",
          reason: "upload_file_too_large",
        }),
      }),
    );
  });

  it("rejects unsupported upload file types before upload service calls", async () => {
    let serviceCalled = false;
    const securityFailures: string[] = [];
    const records: LogRecord[] = [];
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
          serviceCalled = true;
          throw new Error("document service should not run for unsupported files");
        },
      },
      logger: createLogger({ service: "api" }, (record) => records.push(record)),
      uploadConfig,
    });

    const response = await app.request(
      documentUploadPath,
      createUploadRequest({
        contentLength: "300",
        file: createFile("image bytes", "image.png", "image/png"),
        requestId: "req_upload_unsupported_file",
      }),
    );

    expect(response.status).toBe(415);
    expect(apiErrorResponseSchema.parse(await response.json())).toMatchObject({
      code: "UNSUPPORTED_MEDIA_TYPE",
      httpStatus: 415,
    });
    expect(serviceCalled).toBe(false);
    expect(securityFailures).toEqual(["unsupported_file_type"]);
    expect(records).toContainEqual(
      expect.objectContaining({
        event: "api_request_app_error",
        fields: expect.objectContaining({
          code: "UNSUPPORTED_MEDIA_TYPE",
          domain: "api",
          reason: "unsupported_upload_file_type",
        }),
      }),
    );
  });

  it("rejects spoofed PDF signatures and writes a security audit event", async () => {
    const securityFailures: string[] = [];
    const records: LogRecord[] = [];
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
      logger: createLogger({ service: "api" }, (record) => records.push(record)),
      uploadConfig,
    });

    const response = await app.request(
      documentUploadPath,
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
    expect(records).toContainEqual(
      expect.objectContaining({
        event: "api_request_app_error",
        fields: expect.objectContaining({
          code: "VALIDATION_ERROR",
          domain: "api",
          reason: "spoofed_file_signature",
        }),
        level: "error",
      }),
    );
    expect(JSON.stringify(records)).not.toContain("policy.pdf");
  });
});
