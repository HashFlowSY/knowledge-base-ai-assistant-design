import { describe, expect, it } from "vitest";

import { sessionPayloadSchema, type SessionPayload } from "@kb/auth";
import { documentFileUploadResultSchema } from "@kb/knowledge";
import {
  apiErrorResponseSchema,
  apiSuccessResponseSchema,
} from "@kb/shared";

import {
  createApiApp,
  type AuthService,
  type DocumentFileUploadResult,
  type DocumentFileUploadServiceInput,
} from "./app";
import type { RateLimitConsumeInput } from "./rate-limit";

const adminSession = {
  user: { id: "admin_1", name: "管理员", email: "admin@example.com" },
  tenant: { id: "tenant_1" },
  role: "admin" as const,
} satisfies SessionPayload;

const uploadConfig = {
  concurrencyPerActor: 2,
  concurrencyPerTenant: 10,
  maxFileBytes: 1024,
  rateLimitPerMinute: 20,
  requestOverheadBytes: 128,
};

const uploadedAt = "2026-05-23T06:00:00.000Z";

describe("document upload API", () => {
  it("rejects unauthenticated uploads before calling the document service", async () => {
    let serviceCalled = false;
    const app = createApiApp({
      authService: createRejectingAuthService(),
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
  });

  it("uploads one validated file and defaults a blank title from the filename", async () => {
    const capturedInputs: DocumentFileUploadServiceInput[] = [];
    const app = createApiApp({
      authService: createStaticAuthService(adminSession),
      documentService: {
        async uploadDocumentFile(input) {
          capturedInputs.push(input);
          return {
            ok: true,
            result: createUploadResult({
              title: input.title,
              sourceHash: input.checksum,
              sizeBytes: input.sizeBytes,
            }),
          };
        },
      },
      uploadConfig,
    });

    const response = await app.request(
      "/api/knowledge-bases/kb_1/documents/upload",
      createUploadRequest({
        contentLength: "300",
        file: createFile("%PDF-1.4\nhello", "Quarterly Policy.pdf", "application/pdf"),
        requestId: "req_upload_success",
        title: "   ",
      }),
    );

    expect(response.status).toBe(201);
    const parsed = apiSuccessResponseSchema(documentFileUploadResultSchema).parse(
      await response.json(),
    );
    expect(parsed.data.document.title).toBe("Quarterly Policy");
    expect(parsed.data.duplicate).toBe(false);
    const capturedInput = capturedInputs[0];
    if (capturedInput === undefined) {
      throw new Error("document service was not called");
    }

    expect(capturedInput).toMatchObject({
      actor: adminSession,
      knowledgeBaseId: "kb_1",
      mimeType: "application/pdf",
      originalFilename: "Quarterly Policy.pdf",
      sizeBytes: 14,
      title: "Quarterly Policy",
    });
    expect(capturedInput.checksum).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("returns 200 when duplicate content is ignored by the document service", async () => {
    const app = createApiApp({
      authService: createStaticAuthService(adminSession),
      documentService: {
        async uploadDocumentFile(input) {
          return {
            ok: true,
            result: {
              ...createUploadResult({
                title: input.title,
                sourceHash: input.checksum,
                sizeBytes: input.sizeBytes,
              }),
              duplicate: true,
            },
          };
        },
      },
      uploadConfig,
    });

    const response = await app.request(
      "/api/knowledge-bases/kb_1/documents/upload",
      createUploadRequest({
        contentLength: "300",
        file: createFile("%PDF-1.4\nhello", "policy.pdf", "application/pdf"),
        requestId: "req_upload_duplicate",
      }),
    );

    expect(response.status).toBe(200);
    expect(
      apiSuccessResponseSchema(documentFileUploadResultSchema).parse(await response.json())
        .data.duplicate,
    ).toBe(true);
  });

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
    formData.append("file", createFile("%PDF-1.4\nhello", "first.pdf", "application/pdf"));
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
      "/api/knowledge-bases/kb_1/documents/upload",
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

function createUploadRequest(input: {
  contentLength?: string;
  file: File;
  requestId: string;
  title?: string;
}): RequestInit {
  const formData = new FormData();
  formData.append("file", input.file);
  if (input.title !== undefined) {
    formData.append("title", input.title);
  }

  return {
    body: formData,
    headers: createUploadHeaders({
      ...(input.contentLength === undefined
        ? {}
        : { contentLength: input.contentLength }),
      requestId: input.requestId,
    }),
    method: "POST",
  };
}

function createUploadHeaders(input: {
  contentLength?: string;
  requestId: string;
}): HeadersInit {
  return {
    ...(input.contentLength === undefined
      ? {}
      : { "content-length": input.contentLength }),
    cookie: "better-auth.session_token=token",
    origin: "http://localhost:3000",
    "x-request-id": input.requestId,
  };
}

function createFile(content: string, name: string, type: string): File {
  return new File([new TextEncoder().encode(content)], name, { type });
}

function createUploadResult(input: {
  sourceHash: string;
  sizeBytes: number;
  title: string;
}): DocumentFileUploadResult {
  return {
    document: {
      createdAt: uploadedAt,
      currentVersion: 1,
      id: "doc_1",
      knowledgeBaseId: "kb_1",
      status: "pending",
      title: input.title,
      updatedAt: uploadedAt,
    },
    duplicate: false,
    job: {
      createdAt: uploadedAt,
      documentId: "doc_1",
      id: "job_1",
      knowledgeBaseId: "kb_1",
      queuedAt: uploadedAt,
      sourceHash: input.sourceHash,
      sourceType: "file",
      status: "queued",
      updatedAt: uploadedAt,
    },
    source: {
      bucket: "kb-source",
      documentId: "doc_1",
      id: "source_1",
      mimeType: "application/pdf",
      objectKey:
        "tenants/tenant_1/knowledge-bases/kb_1/documents/doc_1/versions/1/source/policy.pdf",
      scanStatus: "not_scanned",
      sizeBytes: input.sizeBytes,
      sourceHash: input.sourceHash,
      sourceType: "file",
      sourceUri: "policy.pdf",
      uploadedAt,
      uploadStatus: "available",
    },
  };
}

function createStaticAuthService(payload: SessionPayload): AuthService {
  sessionPayloadSchema.parse(payload);

  return {
    async login() {
      return {
        code: "UNAUTHORIZED",
        httpStatus: 401,
        message: "邮箱或密码不正确。",
        ok: false,
      };
    },
    async logout() {
      return { ok: true };
    },
    async getSession() {
      return {
        ok: true,
        payload,
      };
    },
  };
}

function createRejectingAuthService(): AuthService {
  return {
    async login() {
      throw new Error("not used");
    },
    async logout() {
      throw new Error("not used");
    },
    async getSession() {
      return {
        code: "UNAUTHORIZED",
        httpStatus: 401,
        message: "请先登录。",
        ok: false,
      };
    },
  };
}
