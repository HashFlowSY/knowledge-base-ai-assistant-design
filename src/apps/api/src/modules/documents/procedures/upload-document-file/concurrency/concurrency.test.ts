import { describe, expect, it } from "vitest";

import { createLogger, type LogRecord } from "@kb/observability";
import { apiErrorResponseSchema } from "@kb/shared";

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
    const records: LogRecord[] = [];
    const app = createApiApp({
      authService: createStaticAuthService(adminSession),
      documentService: {
        async uploadDocumentFile() {
          serviceCalled = true;
          throw new Error("document service should not run after concurrency limit");
        },
      },
      logger: createLogger({ service: "api" }, (record) => records.push(record)),
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
    expect(apiErrorResponseSchema.parse(await response.json())).toMatchObject({
      code: "RATE_LIMITED",
      httpStatus: 429,
      requestId: "req_upload_actor_busy",
    });
    expect(serviceCalled).toBe(false);
    expect(records).toContainEqual(
      expect.objectContaining({
        event: "api_request_app_error",
        requestId: "req_upload_actor_busy",
        fields: expect.objectContaining({
          code: "RATE_LIMITED",
          domain: "api",
          reason: "upload_actor_concurrency_limited",
        }),
      }),
    );
  });

  it("rejects tenant concurrency exhaustion with a rate-limited AppError", async () => {
    let serviceCalled = false;
    const records: LogRecord[] = [];
    const app = createApiApp({
      authService: createStaticAuthService(adminSession),
      documentService: {
        async uploadDocumentFile() {
          serviceCalled = true;
          throw new Error("document service should not run after concurrency limit");
        },
      },
      logger: createLogger({ service: "api" }, (record) => records.push(record)),
      uploadConcurrencyLimiter: {
        acquire() {
          return { ok: false, scope: "tenant" };
        },
      },
      uploadConfig,
    });

    const response = await app.request(
      documentUploadPath,
      createUploadRequest({
        contentLength: "300",
        file: createFile("%PDF-1.4\nhello", "policy.pdf", "application/pdf"),
        requestId: "req_upload_tenant_busy",
      }),
    );

    expect(response.status).toBe(429);
    expect(apiErrorResponseSchema.parse(await response.json())).toMatchObject({
      code: "RATE_LIMITED",
      httpStatus: 429,
      requestId: "req_upload_tenant_busy",
    });
    expect(serviceCalled).toBe(false);
    expect(records).toContainEqual(
      expect.objectContaining({
        event: "api_request_app_error",
        requestId: "req_upload_tenant_busy",
        fields: expect.objectContaining({
          code: "RATE_LIMITED",
          domain: "api",
          reason: "upload_tenant_concurrency_limited",
        }),
      }),
    );
  });
});
