import { sessionPayloadSchema, type SessionPayload } from "@kb/auth";

import type {
  AuthService,
  DocumentFileUploadResult,
} from "../../../../../app";

export const adminSession = {
  user: { id: "admin_1", name: "管理员", email: "admin@example.com" },
  tenant: { id: "tenant_1" },
  role: "admin" as const,
} satisfies SessionPayload;

export const uploadConfig = {
  concurrencyPerActor: 2,
  concurrencyPerTenant: 10,
  maxFileBytes: 1024,
  rateLimitPerMinute: 20,
  requestOverheadBytes: 128,
};

export const knowledgeBaseId = "11111111-1111-4111-8111-111111111111";
export const documentId = "44444444-4444-4444-8444-444444444444";
export const documentUploadPath = `/api/knowledge-bases/${knowledgeBaseId}/documents/upload`;

const uploadedAt = "2026-05-23T06:00:00.000Z";

export function createUploadRequest(input: {
  contentLength?: string;
  file: File;
  origin?: string;
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
      ...(input.origin === undefined ? {} : { origin: input.origin }),
      requestId: input.requestId,
    }),
    method: "POST",
  };
}

export function createUploadHeaders(input: {
  contentLength?: string;
  origin?: string;
  requestId: string;
}): HeadersInit {
  return {
    ...(input.contentLength === undefined
      ? {}
      : { "content-length": input.contentLength }),
    cookie: "better-auth.session_token=token",
    origin: input.origin ?? "http://localhost:3000",
    "x-request-id": input.requestId,
  };
}

export function createFile(content: string, name: string, type: string): File {
  return new File([new TextEncoder().encode(content)], name, { type });
}

export function createUploadResult(input: {
  sourceHash: string;
  sizeBytes: number;
  title: string;
}): DocumentFileUploadResult {
  return {
    document: {
      createdAt: uploadedAt,
      currentVersion: 1,
      id: documentId,
      knowledgeBaseId,
      status: "pending",
      title: input.title,
      updatedAt: uploadedAt,
    },
    duplicate: false,
    job: {
      createdAt: uploadedAt,
      documentId,
      id: "job_1",
      knowledgeBaseId,
      queuedAt: uploadedAt,
      sourceHash: input.sourceHash,
      sourceType: "file",
      status: "queued",
      updatedAt: uploadedAt,
    },
    source: {
      bucket: "kb-source",
      documentId,
      id: "source_1",
      mimeType: "application/pdf",
      objectKey:
        `tenants/tenant_1/knowledge-bases/${knowledgeBaseId}/documents/${documentId}/versions/1/source/policy.pdf`,
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

export function createStaticAuthService(payload: SessionPayload): AuthService {
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

export function createRejectingAuthService(): AuthService {
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
