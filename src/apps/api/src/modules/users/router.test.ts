import { describe, expect, it } from "vitest";

import { userSummarySchema, usersPageSchema } from "@kb/users";
import { apiErrorResponseSchema, apiSuccessResponseSchema } from "@kb/shared";

import { createApiApp } from "../../app";
import type { RateLimitConsumeInput } from "../../rate-limit";
import {
  adminSession,
  createStaticAuthService,
  memberSession,
  userSummary,
} from "../../testing/fakes";

describe("user API router", () => {
  it("protects user-management APIs with the same envelope contract", async () => {
    const app = createApiApp();
    const response = await app.request("/api/users", {
      headers: {
        "x-request-id": "req_users_missing_session",
      },
    });

    expect(response.status).toBe(401);
    expect(apiErrorResponseSchema.parse(await response.json())).toMatchObject({
      success: false,
      httpStatus: 401,
      code: "UNAUTHORIZED",
      requestId: "req_users_missing_session",
    });
  });

  it("forwards cleanup cookies when user-management auth resolution fails", async () => {
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
            ok: false,
            code: "FORBIDDEN",
            httpStatus: 403,
            message: "当前账号无权访问默认租户，请联系管理员。",
            setCookieHeaders: [
              "better-auth.session_token=; Max-Age=0; HttpOnly; SameSite=Lax",
            ],
          };
        },
      },
    });

    const response = await app.request("/api/users", {
      headers: {
        cookie: "better-auth.session_token=token",
        "x-request-id": "req_users_forbidden_cleanup",
      },
    });

    expect(response.status).toBe(403);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(apiErrorResponseSchema.parse(await response.json())).toMatchObject({
      code: "FORBIDDEN",
      httpStatus: 403,
      requestId: "req_users_forbidden_cleanup",
    });
  });

  it("returns user-management list envelopes for admin actors", async () => {
    const app = createApiApp({
      authService: {
        async login() {
          return {
            ok: false,
            code: "UNAUTHORIZED",
            message: "邮箱或密码不正确。",
            httpStatus: 401,
          };
        },
        async logout() {
          return { ok: true };
        },
        async getSession() {
          return {
            ok: true,
            payload: adminSession,
          };
        },
      },
      userService: {
        async listUsers() {
          return {
            ok: true,
            page: {
              items: [
                {
                  id: "admin_1",
                  name: "管理员",
                  email: "admin@example.com",
                  role: "admin",
                  createdAt: "2026-05-18T00:00:00.000Z",
                  updatedAt: "2026-05-18T00:00:00.000Z",
                },
              ],
              page: 1,
              pageSize: 8,
              total: 1,
            },
          };
        },
      },
    });
    const response = await app.request("/api/users?page=1&pageSize=8", {
      headers: {
        cookie: "better-auth.session_token=token",
        "x-request-id": "req_users_success",
      },
    });

    expect(response.status).toBe(200);
    expect(
      apiSuccessResponseSchema(usersPageSchema).parse(await response.json()).data.items[0]?.id,
    ).toBe("admin_1");
  });

  it("returns rate-limit envelopes for exhausted auth and user-management scopes", async () => {
    const app = createApiApp({
      authService: createStaticAuthService(adminSession),
      rateLimiter: {
        async consume(input) {
          expect(input.scope).toBe("user-management");
          return {
            allowed: false,
            retryAfterSeconds: 30,
          };
        },
      },
      userService: {
        async listUsers() {
          throw new Error("domain service should not run after rate limit");
        },
      },
    });

    const response = await app.request("/api/users", {
      headers: {
        cookie: "better-auth.session_token=token",
        "x-request-id": "req_users_limited",
      },
    });

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("30");
    expect(apiErrorResponseSchema.parse(await response.json())).toMatchObject({
      code: "RATE_LIMITED",
      httpStatus: 429,
      requestId: "req_users_limited",
    });
  });

  it("rate-limits unresolved user-management requests before auth envelopes", async () => {
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
            ok: false,
            code: "UNAUTHORIZED",
            message: "请先登录。",
            httpStatus: 401,
          };
        },
      },
      rateLimiter: {
        async consume(input) {
          consumedInputs.push(input);
          return {
            allowed: false,
            retryAfterSeconds: 20,
          };
        },
      },
      userService: {
        async listUsers() {
          throw new Error("domain service should not run after rate limit");
        },
      },
    });

    const response = await app.request("/api/users", {
      headers: {
        "x-forwarded-for": "203.0.113.9",
        "x-request-id": "req_users_unauth_limited",
      },
    });

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("20");
    expect(apiErrorResponseSchema.parse(await response.json())).toMatchObject({
      code: "RATE_LIMITED",
      httpStatus: 429,
      requestId: "req_users_unauth_limited",
    });
    expect(consumedInputs).toHaveLength(1);
    expect(consumedInputs[0]).toMatchObject({
      scope: "user-management",
      limit: 60,
      windowMs: 60_000,
    });
    expect(consumedInputs[0]?.identity).toMatch(/^ip:/);
  });

  it("rejects member user-management requests before domain calls", async () => {
    let listCalls = 0;
    const forbiddenAuditCalls: unknown[] = [];
    const consumedInputs: RateLimitConsumeInput[] = [];
    const app = createApiApp({
      auditService: {
        async recordDocumentUploadSecurityFailure() {
          return undefined;
        },
        async recordForbiddenAdminAttempt(input) {
          forbiddenAuditCalls.push(input);
        },
      },
      authService: createStaticAuthService(memberSession),
      rateLimiter: {
        async consume(input) {
          consumedInputs.push(input);
          return {
            allowed: true,
            retryAfterSeconds: 60,
          };
        },
      },
      userService: {
        async listUsers() {
          listCalls += 1;
          return {
            ok: true,
            page: {
              items: [],
              page: 1,
              pageSize: 8,
              total: 0,
            },
          };
        },
      },
    });

    const response = await app.request("/api/users", {
      headers: {
        cookie: "better-auth.session_token=token",
        "x-request-id": "req_users_member_forbidden",
      },
    });

    expect(response.status).toBe(403);
    expect(apiErrorResponseSchema.parse(await response.json())).toMatchObject({
      code: "FORBIDDEN",
      httpStatus: 403,
      message: "你没有权限执行此操作。",
      requestId: "req_users_member_forbidden",
    });
    expect(listCalls).toBe(0);
    expect(forbiddenAuditCalls).toEqual([
      expect.objectContaining({
        actor: memberSession,
        action: "auth.forbidden",
        method: "GET",
        path: "/api/users",
        requestId: "req_users_member_forbidden",
        targetId: "/api/users",
        targetType: "api_route",
      }),
    ]);
    expect(consumedInputs).toHaveLength(1);
    expect(consumedInputs[0]).toMatchObject({
      identity: "tenant:tenant_1:actor:member_1",
      scope: "user-management",
      limit: 120,
      windowLabel: "1m",
      windowMs: 60_000,
    });
  });

  it("creates users with the project envelope and 201 status", async () => {
    const app = createApiApp({
      authService: createStaticAuthService(adminSession),
      userService: {
        async listUsers() {
          throw new Error("not used");
        },
        async createUser(input) {
          expect(input.actor.user.id).toBe("admin_1");
          expect(input.body).toEqual({
            name: "成员",
            email: "member@example.com",
            role: "member",
            password: "password123",
          });
          return { ok: true, user: userSummary };
        },
      },
    });

    const response = await app.request("/api/users", {
      method: "POST",
      body: JSON.stringify({
        name: " 成员 ",
        email: " Member@Example.COM ",
        role: "member",
        password: "password123",
      }),
      headers: {
        "content-type": "application/json",
        cookie: "better-auth.session_token=token",
        origin: "http://localhost:3000",
        "x-request-id": "req_users_create",
      },
    });

    expect(response.status).toBe(201);
    expect(
      apiSuccessResponseSchema(userSummarySchema).parse(await response.json()),
    ).toMatchObject({
      httpStatus: 201,
      data: {
        id: "user_2",
        email: "member@example.com",
      },
      requestId: "req_users_create",
    });
  });

  it("returns user details through the project envelope", async () => {
    const app = createApiApp({
      authService: createStaticAuthService(adminSession),
      userService: {
        async listUsers() {
          throw new Error("not used");
        },
        async getUser(input) {
          expect(input.userId).toBe("user_2");
          return { ok: true, user: userSummary };
        },
      },
    });

    const response = await app.request("/api/users/user_2", {
      headers: {
        cookie: "better-auth.session_token=token",
        "x-request-id": "req_users_detail",
      },
    });

    expect(response.status).toBe(200);
    expect(
      apiSuccessResponseSchema(userSummarySchema).parse(await response.json()).data.id,
    ).toBe("user_2");
  });

  it("updates users and rejects empty update bodies", async () => {
    const app = createApiApp({
      authService: createStaticAuthService(adminSession),
      userService: {
        async listUsers() {
          throw new Error("not used");
        },
        async updateUser(input) {
          expect(input.userId).toBe("user_2");
          expect(input.body).toEqual({
            name: "新名字",
            password: null,
          });
          return {
            ok: true,
            user: {
              ...userSummary,
              name: "新名字",
            },
          };
        },
      },
    });

    const invalidResponse = await app.request("/api/users/user_2", {
      method: "PATCH",
      body: JSON.stringify({}),
      headers: {
        "content-type": "application/json",
        cookie: "better-auth.session_token=token",
        origin: "http://localhost:3000",
        "x-request-id": "req_users_update_invalid",
      },
    });
    expect(invalidResponse.status).toBe(400);
    expect(apiErrorResponseSchema.parse(await invalidResponse.json()).code).toBe(
      "VALIDATION_ERROR",
    );

    const response = await app.request("/api/users/user_2", {
      method: "PATCH",
      body: JSON.stringify({ name: " 新名字 ", password: "" }),
      headers: {
        "content-type": "application/json",
        cookie: "better-auth.session_token=token",
        origin: "http://localhost:3000",
        "x-request-id": "req_users_update",
      },
    });

    expect(response.status).toBe(200);
    expect(
      apiSuccessResponseSchema(userSummarySchema).parse(await response.json()).data.name,
    ).toBe("新名字");
  });

  it("removes user access with no request body and data null", async () => {
    const app = createApiApp({
      authService: createStaticAuthService(adminSession),
      userService: {
        async listUsers() {
          throw new Error("not used");
        },
        async removeUserAccess(input) {
          expect(input.userId).toBe("user_2");
          return { ok: true };
        },
      },
    });

    const invalidResponse = await app.request("/api/users/user_2/access", {
      method: "DELETE",
      body: JSON.stringify({}),
      headers: {
        "content-type": "application/json",
        cookie: "better-auth.session_token=token",
        origin: "http://localhost:3000",
        "x-request-id": "req_users_delete_body",
      },
    });
    expect(invalidResponse.status).toBe(400);
    expect(apiErrorResponseSchema.parse(await invalidResponse.json()).code).toBe(
      "VALIDATION_ERROR",
    );

    const response = await app.request("/api/users/user_2/access", {
      method: "DELETE",
      headers: {
        cookie: "better-auth.session_token=token",
        origin: "http://localhost:3000",
        "x-request-id": "req_users_delete",
      },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      httpStatus: 200,
      data: null,
      requestId: "req_users_delete",
    });
  });

  it("exports the user response schema used by route handlers", () => {
    expect(
      apiSuccessResponseSchema(userSummarySchema).parse({
        success: true,
        httpStatus: 201,
        data: {
          id: "user_2",
          name: "成员",
          email: "member@example.com",
          role: "member",
          createdAt: "2026-05-18T00:00:00.000Z",
          updatedAt: "2026-05-18T00:00:00.000Z",
        },
        requestId: "req_schema",
      }).data.id,
    ).toBe("user_2");
  });
});
