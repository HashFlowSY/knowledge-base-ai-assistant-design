import { describe, expect, it } from "vitest";

import { notFound } from "@kb/errors";
import {
  documentProcessingPageSchema,
  documentProcessingSummarySchema,
  retryDocumentProcessingResultSchema,
} from "@kb/knowledge";
import { apiErrorResponseSchema, apiSuccessResponseSchema } from "@kb/shared";

import { createApiApp } from "../../../app";
import type { RateLimitConsumeInput } from "../../../rate-limit";
import {
  adminSession,
  createRejectingAuthService,
  createStaticAuthService,
} from "./upload-document-file/support/test-helpers";

const KNOWLEDGE_BASE_ID = "11111111-1111-4111-8111-111111111111";
const DOCUMENT_ID = "44444444-4444-4444-8444-444444444444";

const documentProcessingSummary = documentProcessingSummarySchema.parse({
  currentVersion: 1,
  id: DOCUMENT_ID,
  job: {
    attempts: 1,
    canRetry: false,
    currentStep: "embedding",
    id: "job_1",
    lastErrorCode: null,
    lastErrorMessage: null,
    maxAttempts: 3,
    status: "queued",
    updatedAt: "2026-05-23T06:00:00.000Z",
  },
  progress: {
    chunkCount: 23,
    embeddedCount: 20,
  },
  source: {
    objectCleanupStatus: "not_required",
  },
  status: "processing",
  title: "采购制度",
  updatedAt: "2026-05-23T06:00:00.000Z",
});

describe("document processing list API", () => {
  it("delegates paginated processing queries to the document service", async () => {
    const app = createApiApp({
      authService: createStaticAuthService(adminSession),
      documentService: {
        async listDocumentProcessing(input) {
          expect(input).toEqual({
            actor: {
              role: "admin",
              tenant: { id: "tenant_1" },
              user: { id: "admin_1" },
            },
            knowledgeBaseId: KNOWLEDGE_BASE_ID,
            query: {
              page: 2,
              pageSize: 5,
            },
          });
          return {
            ok: true,
            page: {
              items: [documentProcessingSummary],
              page: 2,
              pageSize: 5,
              total: 6,
            },
          };
        },
      },
    });

    const response = await app.request(
      `/api/knowledge-bases/${KNOWLEDGE_BASE_ID}/documents/processing?page=2&pageSize=5`,
      {
        headers: {
          cookie: "better-auth.session_token=token",
          "x-request-id": "req_doc_processing_list",
        },
      },
    );

    expect(response.status).toBe(200);
    expect(
      apiSuccessResponseSchema(documentProcessingPageSchema).parse(
        await response.json(),
      ),
    ).toMatchObject({
      data: {
        items: [{ id: DOCUMENT_ID, job: { status: "queued" } }],
        page: 2,
        pageSize: 5,
        total: 6,
      },
      requestId: "req_doc_processing_list",
    });
  });

  it("returns a validation envelope for non-UUID processing list knowledge base params", async () => {
    const app = createApiApp({
      authService: createStaticAuthService(adminSession),
      documentService: {
        async listDocumentProcessing() {
          throw new Error("document service should not run for invalid params");
        },
      },
    });

    const response = await app.request(
      "/api/knowledge-bases/not-a-uuid/documents/processing?page=2&pageSize=5",
      {
        headers: {
          cookie: "better-auth.session_token=token",
          "x-request-id": "req_doc_processing_invalid_param",
        },
      },
    );

    expect(response.status).toBe(400);
    expect(apiErrorResponseSchema.parse(await response.json())).toMatchObject({
      code: "VALIDATION_ERROR",
      httpStatus: 400,
      requestId: "req_doc_processing_invalid_param",
    });
  });
});

describe("document processing retry API", () => {
  it.each([
    {
      expectedCode: "FORBIDDEN",
      expectedStatus: 403,
      headers: {
        "content-type": "application/json",
        origin: "http://evil.example",
      },
      name: "bad origin",
    },
    {
      expectedCode: "UNSUPPORTED_MEDIA_TYPE",
      expectedStatus: 415,
      headers: {
        "content-type": "text/plain",
        origin: "http://localhost:3000",
      },
      name: "non-JSON content type",
    },
    {
      expectedCode: "UNSUPPORTED_MEDIA_TYPE",
      expectedStatus: 415,
      headers: {
        origin: "http://localhost:3000",
      },
      name: "missing content type",
    },
    {
      expectedCode: "FORBIDDEN",
      expectedStatus: 403,
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
        "sec-fetch-site": "cross-site",
      },
      name: "bad Sec-Fetch-Site",
    },
  ])(
    "consumes the unresolved knowledge-base limiter before returning $name guard errors",
    async ({ expectedCode, expectedStatus, headers }) => {
      let serviceCalled = false;
      const consumedInputs: RateLimitConsumeInput[] = [];
      const app = createApiApp({
        authService: createStaticAuthService(adminSession),
        documentService: {
          async retryDocumentProcessing() {
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
      });

      const response = await app.request(
        `/api/knowledge-bases/${KNOWLEDGE_BASE_ID}/documents/${DOCUMENT_ID}/retry`,
        {
          body: JSON.stringify({}),
          headers: {
            ...headers,
            cookie: "better-auth.session_token=token",
            "x-forwarded-for": "203.0.113.42",
            "x-request-id": "req_doc_retry_guard",
          },
          method: "POST",
        },
      );

      expect(response.status).toBe(expectedStatus);
      expect(apiErrorResponseSchema.parse(await response.json())).toMatchObject({
        code: expectedCode,
        requestId: "req_doc_retry_guard",
      });
      expect(serviceCalled).toBe(false);
      expect(consumedInputs).toHaveLength(1);
      expect(consumedInputs[0]).toMatchObject({
        limit: 60,
        scope: "knowledge-base",
        windowLabel: "1m",
      });
      expect(consumedInputs[0]?.identity).toMatch(/^ip:/);
    },
  );

  it.each([
    {
      headers: {
        "content-type": "application/json",
        origin: "http://evil.example",
      },
      name: "bad origin",
    },
    {
      headers: {
        "content-type": "text/plain",
        origin: "http://localhost:3000",
      },
      name: "non-JSON content type",
    },
    {
      headers: {
        origin: "http://localhost:3000",
      },
      name: "missing content type",
    },
    {
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
        "sec-fetch-site": "cross-site",
      },
      name: "bad Sec-Fetch-Site",
    },
  ])(
    "returns rate-limit errors when unresolved limiter denies $name guard failures",
    async ({ headers }) => {
      let serviceCalled = false;
      const consumedInputs: RateLimitConsumeInput[] = [];
      const app = createApiApp({
        authService: createStaticAuthService(adminSession),
        documentService: {
          async retryDocumentProcessing() {
            serviceCalled = true;
            throw new Error("document service should not run");
          },
        },
        rateLimiter: {
          async consume(input) {
            consumedInputs.push(input);
            return { allowed: false, retryAfterSeconds: 19 };
          },
        },
      });

      const response = await app.request(
        `/api/knowledge-bases/${KNOWLEDGE_BASE_ID}/documents/${DOCUMENT_ID}/retry`,
        {
          body: JSON.stringify({}),
          headers: {
            ...headers,
            cookie: "better-auth.session_token=token",
            "x-forwarded-for": "203.0.113.42",
            "x-request-id": "req_doc_retry_guard_limited",
          },
          method: "POST",
        },
      );

      expect(response.status).toBe(429);
      expect(response.headers.get("retry-after")).toBe("19");
      expect(apiErrorResponseSchema.parse(await response.json())).toMatchObject({
        code: "RATE_LIMITED",
        requestId: "req_doc_retry_guard_limited",
      });
      expect(serviceCalled).toBe(false);
      expect(consumedInputs).toHaveLength(1);
      expect(consumedInputs[0]).toMatchObject({
        limit: 60,
        scope: "knowledge-base",
        windowLabel: "1m",
      });
      expect(consumedInputs[0]?.identity).toMatch(/^ip:/);
    },
  );

  it("rate-limits unauthenticated retry attempts by IP", async () => {
    const consumedInputs: RateLimitConsumeInput[] = [];
    const app = createApiApp({
      authService: createRejectingAuthService(),
      rateLimiter: {
        async consume(input) {
          consumedInputs.push(input);
          return { allowed: false, retryAfterSeconds: 13 };
        },
      },
    });

    const response = await app.request(
      `/api/knowledge-bases/${KNOWLEDGE_BASE_ID}/documents/${DOCUMENT_ID}/retry`,
      {
        body: JSON.stringify({}),
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:3000",
          "x-forwarded-for": "203.0.113.42",
          "x-request-id": "req_doc_retry_limited",
        },
        method: "POST",
      },
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("13");
    expect(consumedInputs[0]).toMatchObject({
      limit: 60,
      scope: "knowledge-base",
    });
    expect(consumedInputs[0]?.identity).toMatch(/^ip:/);
  });

  it("delegates retry to the document service with actor and path identifiers", async () => {
    const app = createApiApp({
      authService: createStaticAuthService(adminSession),
      documentService: {
        async retryDocumentProcessing(input) {
          expect(input).toEqual({
            actor: {
              role: "admin",
              tenant: { id: "tenant_1" },
              user: { id: "admin_1" },
            },
            documentId: DOCUMENT_ID,
            knowledgeBaseId: KNOWLEDGE_BASE_ID,
          });
          return {
            ok: true,
            result: {
              document: documentProcessingSummary,
              queued: true,
            },
          };
        },
      },
    });

    const response = await app.request(
      `/api/knowledge-bases/${KNOWLEDGE_BASE_ID}/documents/${DOCUMENT_ID}/retry`,
      {
        body: JSON.stringify({}),
        headers: {
          "content-type": "application/json",
          cookie: "better-auth.session_token=token",
          origin: "http://localhost:3000",
          "x-request-id": "req_doc_retry",
        },
        method: "POST",
      },
    );

    expect(response.status).toBe(200);
    expect(
      apiSuccessResponseSchema(retryDocumentProcessingResultSchema).parse(
        await response.json(),
      ),
    ).toMatchObject({
      data: {
        document: {
          id: DOCUMENT_ID,
          job: { status: "queued" },
        },
        queued: true,
      },
      requestId: "req_doc_retry",
    });
  });

  it("maps retry service AppError through the standard error envelope", async () => {
    const app = createApiApp({
      authService: createStaticAuthService(adminSession),
      documentService: {
        async retryDocumentProcessing() {
          throw notFound({
            domain: "knowledge",
            reason: "knowledge_base_not_found",
            message: "知识库不存在或无权访问。",
          });
        },
      },
    });

    const response = await app.request(
      `/api/knowledge-bases/${KNOWLEDGE_BASE_ID}/documents/${DOCUMENT_ID}/retry`,
      {
        body: JSON.stringify({}),
        headers: {
          "content-type": "application/json",
          cookie: "better-auth.session_token=token",
          origin: "http://localhost:3000",
          "x-request-id": "req_doc_retry_not_found",
        },
        method: "POST",
      },
    );

    expect(response.status).toBe(404);
    expect(apiErrorResponseSchema.parse(await response.json())).toMatchObject({
      code: "NOT_FOUND",
      requestId: "req_doc_retry_not_found",
    });
  });

  it.each([
    {
      name: "knowledge base id",
      path: `/api/knowledge-bases/not-a-uuid/documents/${DOCUMENT_ID}/retry`,
      requestId: "req_doc_retry_invalid_kb_param",
    },
    {
      name: "document id",
      path: `/api/knowledge-bases/${KNOWLEDGE_BASE_ID}/documents/not-a-uuid/retry`,
      requestId: "req_doc_retry_invalid_doc_param",
    },
  ])("returns a validation envelope for non-UUID retry $name params", async ({
    path,
    requestId,
  }) => {
    const app = createApiApp({
      authService: createStaticAuthService(adminSession),
      documentService: {
        async retryDocumentProcessing() {
          throw new Error("document service should not run for invalid params");
        },
      },
    });

    const response = await app.request(path, {
      body: JSON.stringify({}),
      headers: {
        "content-type": "application/json",
        cookie: "better-auth.session_token=token",
        origin: "http://localhost:3000",
        "x-request-id": requestId,
      },
      method: "POST",
    });

    expect(response.status).toBe(400);
    expect(apiErrorResponseSchema.parse(await response.json())).toMatchObject({
      code: "VALIDATION_ERROR",
      httpStatus: 400,
      requestId,
    });
  });
});
