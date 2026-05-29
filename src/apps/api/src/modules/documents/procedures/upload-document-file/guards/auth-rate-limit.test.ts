import { describe, expect, it } from "vitest";

import { apiErrorResponseSchema } from "@kb/shared";

import { createApiApp } from "../../../../../app";
import type { RateLimitConsumeInput } from "../../../../../rate-limit";
import {
  adminSession,
  createFile,
  createRejectingAuthService,
  createStaticAuthService,
  createUploadRequest,
  uploadConfig,
} from "../support/test-helpers";

describe("document upload API auth and rate limits", () => {
  it("rejects unauthenticated uploads before calling the document service", async () => {
    const consumedInputs: RateLimitConsumeInput[] = [];
    let serviceCalled = false;
    const app = createApiApp({
      authService: createRejectingAuthService(),
      documentService: {
        async uploadDocumentFile() {
          serviceCalled = true;
          throw new Error("document service should not run");
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
      "/api/knowledge-bases/kb_1/documents/upload",
      createUploadRequest({
        contentLength: "300",
        file: createFile("%PDF-1.4\nhello", "policy.pdf", "application/pdf"),
        requestId: "req_upload_unauth",
      }),
    );

    expect(response.status).toBe(401);
    expect(apiErrorResponseSchema.parse(await response.json())).toMatchObject({
      code: "UNAUTHORIZED",
      requestId: "req_upload_unauth",
    });
    expect(serviceCalled).toBe(false);
    expect(consumedInputs).toHaveLength(1);
    expect(consumedInputs[0]).toMatchObject({
      limit: 20,
      scope: "document-upload",
      windowLabel: "1m",
    });
    expect(consumedInputs[0]?.identity).toMatch(/^ip:/);
  });

  it("counts invalid upload origins against the unauthenticated upload limiter", async () => {
    const consumedInputs: RateLimitConsumeInput[] = [];
    const app = createApiApp({
      authService: createRejectingAuthService(),
      documentService: {
        async uploadDocumentFile() {
          throw new Error("document service should not run for invalid origins");
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
      "/api/knowledge-bases/kb_1/documents/upload",
      createUploadRequest({
        contentLength: "300",
        file: createFile("%PDF-1.4\nhello", "policy.pdf", "application/pdf"),
        origin: "http://evil.example",
        requestId: "req_upload_bad_origin",
      }),
    );

    expect(response.status).toBe(403);
    expect(consumedInputs).toHaveLength(1);
    expect(consumedInputs[0]).toMatchObject({
      limit: 20,
      scope: "document-upload",
      windowLabel: "1m",
    });
    expect(consumedInputs[0]?.identity).toMatch(/^ip:/);
  });

  it("counts unsupported upload content types against the unauthenticated upload limiter", async () => {
    const consumedInputs: RateLimitConsumeInput[] = [];
    const app = createApiApp({
      authService: createRejectingAuthService(),
      rateLimiter: {
        async consume(input) {
          consumedInputs.push(input);
          return { allowed: true, retryAfterSeconds: 60 };
        },
      },
      uploadConfig,
    });

    const response = await app.request(
      "/api/knowledge-bases/kb_1/documents/upload",
      {
        body: "not multipart",
        headers: {
          "content-length": "20",
          "content-type": "text/plain",
          cookie: "better-auth.session_token=token",
          origin: "http://localhost:3000",
          "x-request-id": "req_upload_bad_content_type",
        },
        method: "POST",
      },
    );

    expect(response.status).toBe(415);
    expect(consumedInputs).toHaveLength(1);
    expect(consumedInputs[0]).toMatchObject({
      limit: 20,
      scope: "document-upload",
      windowLabel: "1m",
    });
    expect(consumedInputs[0]?.identity).toMatch(/^ip:/);
  });

  it("uses the authenticated actor upload rate limit before upload processing", async () => {
    const consumedInputs: RateLimitConsumeInput[] = [];
    let serviceCalled = false;
    const app = createApiApp({
      authService: createStaticAuthService(adminSession),
      documentService: {
        async uploadDocumentFile() {
          serviceCalled = true;
          throw new Error("document service should not run after rate limit");
        },
      },
      rateLimiter: {
        async consume(input) {
          consumedInputs.push(input);
          return { allowed: false, retryAfterSeconds: 11 };
        },
      },
      uploadConfig,
    });

    const response = await app.request(
      "/api/knowledge-bases/kb_1/documents/upload",
      createUploadRequest({
        contentLength: "300",
        file: createFile("%PDF-1.4\nhello", "policy.pdf", "application/pdf"),
        requestId: "req_upload_rate_limited",
      }),
    );

    expect(response.status).toBe(429);
    expect(serviceCalled).toBe(false);
    expect(consumedInputs[0]).toMatchObject({
      identity: "tenant:tenant_1:actor:admin_1",
      limit: 20,
      scope: "document-upload",
      windowLabel: "1m",
    });
  });
});
