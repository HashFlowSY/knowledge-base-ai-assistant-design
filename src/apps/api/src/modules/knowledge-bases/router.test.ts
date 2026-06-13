import { describe, expect, it } from "vitest";

import { sessionPayloadSchema, type SessionPayload } from "@kb/auth";
import {
  knowledgeBaseDetailSchema,
  knowledgeBasesPageSchema,
} from "@kb/knowledge";
import {
  apiErrorResponseSchema,
  apiSuccessResponseSchema,
} from "@kb/shared";

import { createApiApp, type AuthService } from "../../app";
import type { RateLimitConsumeInput } from "../../rate-limit";

const adminSession = {
  user: { id: "admin_1", name: "管理员", email: "admin@example.com" },
  tenant: { id: "tenant_1" },
  role: "admin" as const,
} satisfies SessionPayload;

const memberSession = {
  user: { id: "member_1", name: "成员", email: "member@example.com" },
  tenant: { id: "tenant_1" },
  role: "member" as const,
} satisfies SessionPayload;

const KNOWLEDGE_BASE_ID = "11111111-1111-4111-8111-111111111111";

const knowledgeBaseSummary = {
  createdAt: "2026-05-18T00:00:00.000Z",
  description: "供应商资料",
  documentCount: 3,
  id: KNOWLEDGE_BASE_ID,
  memberCount: 1,
  members: [
    {
      email: "member@example.com",
      id: "member_1",
      name: "成员",
    },
  ],
  name: "采购知识库",
  updatedAt: "2026-05-19T00:00:00.000Z",
};

const knowledgeBaseDetail = {
  ...knowledgeBaseSummary,
};

describe("knowledge-base API", () => {
  it("returns list envelopes for authenticated actors", async () => {
    const app = createApiApp({
      authService: createStaticAuthService(adminSession),
      knowledgeBaseService: {
        async listKnowledgeBases(input) {
          expect(input.actor).toEqual({
            role: "admin",
            tenant: { id: "tenant_1" },
            user: { id: "admin_1" },
          });
          expect(input.query).toEqual({
            page: 1,
            pageSize: 8,
            search: "合同",
            sort: "name",
          });
          return {
            ok: true,
            page: {
              items: [knowledgeBaseSummary],
              page: 1,
              pageSize: 8,
              total: 1,
            },
          };
        },
      },
    });

    const response = await app.request(
      "/api/knowledge-bases?search=%E5%90%88%E5%90%8C&sort=name",
      {
        headers: {
          cookie: "better-auth.session_token=token",
          "x-request-id": "req_kb_list",
        },
      },
    );

    expect(response.status).toBe(200);
    expect(
      apiSuccessResponseSchema(knowledgeBasesPageSchema).parse(await response.json()),
    ).toMatchObject({
      data: {
        items: [{ id: KNOWLEDGE_BASE_ID, name: "采购知识库" }],
        total: 1,
      },
      requestId: "req_kb_list",
    });
  });

  it("returns detail envelopes without exposing slug or visibility", async () => {
    const app = createApiApp({
      authService: createStaticAuthService(memberSession),
      knowledgeBaseService: {
        async getKnowledgeBase(input) {
          expect(input.actor).toEqual({
            role: "member",
            tenant: { id: "tenant_1" },
            user: { id: "member_1" },
          });
          expect(input.knowledgeBaseId).toBe(KNOWLEDGE_BASE_ID);
          return {
            knowledgeBase: knowledgeBaseDetail,
            ok: true,
          };
        },
      },
    });

    const response = await app.request(`/api/knowledge-bases/${KNOWLEDGE_BASE_ID}`, {
      headers: {
        cookie: "better-auth.session_token=token",
        "x-request-id": "req_kb_detail",
      },
    });

    expect(response.status).toBe(200);
    const parsed = apiSuccessResponseSchema(knowledgeBaseDetailSchema).parse(
      await response.json(),
    );
    expect(parsed.data.id).toBe(KNOWLEDGE_BASE_ID);
    expect(parsed.data).not.toHaveProperty("slug");
    expect(parsed.data).not.toHaveProperty("visibility");
  });

  it("returns a validation envelope for non-UUID knowledge base detail params", async () => {
    const app = createApiApp({
      authService: createStaticAuthService(memberSession),
      knowledgeBaseService: {
        async getKnowledgeBase() {
          throw new Error("knowledge base service should not run for invalid params");
        },
      },
    });

    const response = await app.request("/api/knowledge-bases/not-a-uuid", {
      headers: {
        cookie: "better-auth.session_token=token",
        "x-request-id": "req_kb_detail_invalid_param",
      },
    });

    expect(response.status).toBe(400);
    expect(apiErrorResponseSchema.parse(await response.json())).toMatchObject({
      code: "VALIDATION_ERROR",
      httpStatus: 400,
      requestId: "req_kb_detail_invalid_param",
    });
  });

  it("creates knowledge bases with admin actor and maps conflicts to 409", async () => {
    const app = createApiApp({
      authService: createStaticAuthService(adminSession),
      knowledgeBaseService: {
        async createKnowledgeBase(input) {
          expect(input.actor).toEqual({
            role: "admin",
            tenant: { id: "tenant_1" },
            user: { id: "admin_1" },
          });
          expect(input.body).toEqual({
            description: null,
            memberIds: ["member_1"],
            name: "采购知识库",
          });
          return {
            ok: false,
            code: "CONFLICT",
            httpStatus: 409,
            message: "当前租户下已存在同名知识库。",
          };
        },
      },
    });

    const response = await app.request("/api/knowledge-bases", {
      body: JSON.stringify({
        description: "",
        memberIds: ["member_1", "member_1"],
        name: "  采购知识库  ",
      }),
      headers: {
        "content-type": "application/json",
        cookie: "better-auth.session_token=token",
        origin: "http://localhost:3000",
        "x-request-id": "req_kb_create_conflict",
      },
      method: "POST",
    });

    expect(response.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await response.json())).toMatchObject({
      code: "CONFLICT",
      httpStatus: 409,
      requestId: "req_kb_create_conflict",
    });
  });

  it("updates knowledge bases through admin-only mutation routes", async () => {
    const app = createApiApp({
      authService: createStaticAuthService(adminSession),
      knowledgeBaseService: {
        async updateKnowledgeBase(input) {
          expect(input.actor).toEqual({
            role: "admin",
            tenant: { id: "tenant_1" },
            user: { id: "admin_1" },
          });
          expect(input.knowledgeBaseId).toBe(KNOWLEDGE_BASE_ID);
          expect(input.body).toEqual({
            description: "新版描述",
            memberIds: [],
            name: "新版知识库",
          });
          return {
            knowledgeBase: {
              ...knowledgeBaseDetail,
              description: "新版描述",
              memberCount: 0,
              members: [],
              name: "新版知识库",
            },
            ok: true,
          };
        },
      },
    });

    const response = await app.request(`/api/knowledge-bases/${KNOWLEDGE_BASE_ID}`, {
      body: JSON.stringify({
        description: " 新版描述 ",
        memberIds: [],
        name: " 新版知识库 ",
      }),
      headers: {
        "content-type": "application/json",
        cookie: "better-auth.session_token=token",
        origin: "http://localhost:3000",
        "x-request-id": "req_kb_update",
      },
      method: "PATCH",
    });

    expect(response.status).toBe(200);
    expect(
      apiSuccessResponseSchema(knowledgeBaseDetailSchema).parse(await response.json())
        .data.name,
    ).toBe("新版知识库");
  });

  it("returns a validation envelope for non-UUID knowledge base update params", async () => {
    const app = createApiApp({
      authService: createStaticAuthService(adminSession),
      knowledgeBaseService: {
        async updateKnowledgeBase() {
          throw new Error("knowledge base service should not run for invalid params");
        },
      },
    });

    const response = await app.request("/api/knowledge-bases/not-a-uuid", {
      body: JSON.stringify({
        description: "新版描述",
        memberIds: [],
        name: "新版知识库",
      }),
      headers: {
        "content-type": "application/json",
        cookie: "better-auth.session_token=token",
        origin: "http://localhost:3000",
        "x-request-id": "req_kb_update_invalid_param",
      },
      method: "PATCH",
    });

    expect(response.status).toBe(400);
    expect(apiErrorResponseSchema.parse(await response.json())).toMatchObject({
      code: "VALIDATION_ERROR",
      httpStatus: 400,
      requestId: "req_kb_update_invalid_param",
    });
  });

  it("rejects member write attempts after tenant+actor rate limiting", async () => {
    const consumedInputs: RateLimitConsumeInput[] = [];
    const app = createApiApp({
      authService: createStaticAuthService(memberSession),
      rateLimiter: {
        async consume(input) {
          consumedInputs.push(input);
          return { allowed: true, retryAfterSeconds: 60 };
        },
      },
      knowledgeBaseService: {
        async createKnowledgeBase() {
          throw new Error("domain service should not run for member writes");
        },
      },
    });

    const response = await app.request("/api/knowledge-bases", {
      body: JSON.stringify({ memberIds: [], name: "成员不可创建" }),
      headers: {
        "content-type": "application/json",
        cookie: "better-auth.session_token=token",
        origin: "http://localhost:3000",
        "x-request-id": "req_kb_member_forbidden",
      },
      method: "POST",
    });

    expect(response.status).toBe(403);
    expect(apiErrorResponseSchema.parse(await response.json())).toMatchObject({
      code: "FORBIDDEN",
      requestId: "req_kb_member_forbidden",
    });
    expect(consumedInputs[0]).toMatchObject({
      identity: "tenant:tenant_1:actor:member_1",
      scope: "knowledge-base",
    });
  });

  it("rate-limits unresolved knowledge-base requests by IP before auth envelopes", async () => {
    const consumedInputs: RateLimitConsumeInput[] = [];
    const app = createApiApp({
      authService: {
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
      },
      rateLimiter: {
        async consume(input) {
          consumedInputs.push(input);
          return { allowed: false, retryAfterSeconds: 17 };
        },
      },
    });

    const response = await app.request("/api/knowledge-bases", {
      headers: {
        "x-forwarded-for": "203.0.113.42",
        "x-request-id": "req_kb_unauth_limited",
      },
    });

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("17");
    expect(apiErrorResponseSchema.parse(await response.json())).toMatchObject({
      code: "RATE_LIMITED",
      requestId: "req_kb_unauth_limited",
    });
    expect(consumedInputs[0]).toMatchObject({
      limit: 60,
      scope: "knowledge-base",
      windowLabel: "1m",
    });
    expect(consumedInputs[0]?.identity).toMatch(/^ip:/);
  });

  it("does not expose a delete route", async () => {
    const app = createApiApp({
      authService: createStaticAuthService(adminSession),
    });

    const response = await app.request("/api/knowledge-bases/kb_1", {
      method: "DELETE",
    });

    expect(response.status).toBe(404);
  });
});

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
