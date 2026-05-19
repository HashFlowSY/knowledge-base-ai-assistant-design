import { describe, expect, it } from "vitest";

import { apiErrorResponseSchema, apiSuccessResponseSchema } from "@kb/shared";
import { sessionPayloadSchema } from "@kb/auth";
import { userSummarySchema, usersPageSchema } from "@kb/users";

import {
  createApiApp,
  createDefaultApiApp,
  healthResponseSchema,
  type AuthService,
} from "./app";
import type { RateLimitConsumeInput } from "./rate-limit";

const adminSession = {
  user: { id: "admin_1", name: "管理员", email: "admin@example.com" },
  tenant: { id: "tenant_1" },
  role: "admin" as const,
};

const memberSession = {
  user: { id: "member_1", name: "成员", email: "member@example.com" },
  tenant: { id: "tenant_1" },
  role: "member" as const,
};

const userSummary = {
  id: "user_2",
  name: "成员",
  email: "member@example.com",
  role: "member" as const,
  createdAt: "2026-05-18T00:00:00.000Z",
  updatedAt: "2026-05-18T00:00:00.000Z",
};

describe("@kb/api", () => {
  it("returns a typed health payload and request id header", async () => {
    const app = createApiApp();
    const response = await app.request("/health", {
      headers: {
        "x-request-id": "req_test",
      },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe("req_test");
    expect(healthResponseSchema.parse(await response.json())).toMatchObject({
      status: "ok",
      service: "api",
      requestId: "req_test",
    });
  });

  it("returns a uniform validation error when login body is invalid", async () => {
    const app = createApiApp();
    const response = await app.request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "not-email" }),
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
        "x-request-id": "req_login_validation",
      },
    });

    expect(response.status).toBe(400);
    expect(apiErrorResponseSchema.parse(await response.json())).toMatchObject({
      success: false,
      httpStatus: 400,
      code: "VALIDATION_ERROR",
      requestId: "req_login_validation",
    });
  });

  it("rate-limits malformed login bodies with the auth IP identity before validation", async () => {
    let loginCalls = 0;
    const consumedInputs: RateLimitConsumeInput[] = [];
    const app = createApiApp({
      authService: {
        async login() {
          loginCalls += 1;
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
          throw new Error("not used");
        },
      },
      rateLimiter: {
        async consume(input) {
          consumedInputs.push(input);
          return {
            allowed: false,
            retryAfterSeconds: 12,
          };
        },
      },
    });

    const response = await app.request("/api/auth/login", {
      method: "POST",
      body: "{",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
        "x-forwarded-for": "203.0.113.10",
        "x-request-id": "req_login_malformed_limited",
      },
    });

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("12");
    expect(apiErrorResponseSchema.parse(await response.json())).toMatchObject({
      code: "RATE_LIMITED",
      httpStatus: 429,
      requestId: "req_login_malformed_limited",
    });
    expect(loginCalls).toBe(0);
    expect(consumedInputs).toHaveLength(1);
    expect(consumedInputs[0]).toMatchObject({
      scope: "auth",
      limit: 30,
      windowLabel: "15m",
      windowMs: 15 * 60_000,
    });
    expect(consumedInputs[0]?.identity).toMatch(/^ip:/);
    expect(consumedInputs[0]?.identity).not.toContain(":email:");
  });

  it("returns the project session envelope for successful login", async () => {
    const app = createApiApp({
      authService: {
        async login() {
          return {
            ok: true,
            payload: {
              user: { id: "user_1", name: "管理员", email: "admin@example.com" },
              tenant: { id: "tenant_1" },
              role: "admin",
            },
            setCookieHeaders: ["better-auth.session_token=token; HttpOnly; SameSite=Lax"],
          };
        },
        async logout() {
          return { ok: true };
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
    });
    const response = await app.request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "admin@example.com", password: "password123" }),
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
        "x-request-id": "req_login_success",
      },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("better-auth.session_token");
    expect(
      apiSuccessResponseSchema(sessionPayloadSchema).parse(await response.json()),
    ).toMatchObject({
      success: true,
      httpStatus: 200,
      requestId: "req_login_success",
      data: {
        role: "admin",
      },
    });
  });

  it("uses no request body for logout", async () => {
    const app = createApiApp();
    const response = await app.request("/api/auth/logout", {
      method: "POST",
      body: JSON.stringify({}),
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
        "x-request-id": "req_logout_body",
      },
    });

    expect(response.status).toBe(400);
    expect(apiErrorResponseSchema.parse(await response.json()).code).toBe(
      "VALIDATION_ERROR",
    );
  });

  it("forwards auth service Set-Cookie headers on forbidden login and logout", async () => {
    const authService: AuthService = {
      async login() {
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
      async logout() {
        return {
          ok: true,
          setCookieHeaders: [
            "better-auth.session_token=; Max-Age=0; HttpOnly; SameSite=Lax",
          ],
        };
      },
      async getSession() {
        return {
          ok: false,
          code: "UNAUTHORIZED",
          message: "请先登录。",
          httpStatus: 401,
        };
      },
    };
    const app = createApiApp({ authService });

    const loginResponse = await app.request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: "removed@example.com",
        password: "password123",
      }),
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
        "x-request-id": "req_forbidden_login_cookie",
      },
    });
    expect(loginResponse.status).toBe(403);
    expect(loginResponse.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(apiErrorResponseSchema.parse(await loginResponse.json())).toMatchObject({
      code: "FORBIDDEN",
      requestId: "req_forbidden_login_cookie",
    });

    const logoutResponse = await app.request("/api/auth/logout", {
      method: "POST",
      headers: {
        cookie: "better-auth.session_token=token",
        origin: "http://localhost:3000",
        "x-request-id": "req_logout_cookie",
      },
    });
    expect(logoutResponse.status).toBe(200);
    expect(logoutResponse.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("returns an unauthorized envelope for missing session", async () => {
    const app = createApiApp();
    const response = await app.request("/api/auth/session", {
      headers: {
        "x-request-id": "req_missing_session",
      },
    });

    expect(response.status).toBe(401);
    expect(apiErrorResponseSchema.parse(await response.json())).toMatchObject({
      success: false,
      httpStatus: 401,
      code: "UNAUTHORIZED",
      message: "请先登录。",
      requestId: "req_missing_session",
    });
  });

  it("preserves auth service session error codes and cleanup cookies", async () => {
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

    const response = await app.request("/api/auth/session", {
      headers: {
        cookie: "better-auth.session_token=token",
        "x-request-id": "req_session_forbidden",
      },
    });

    expect(response.status).toBe(403);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(apiErrorResponseSchema.parse(await response.json())).toMatchObject({
      success: false,
      httpStatus: 403,
      code: "FORBIDDEN",
      requestId: "req_session_forbidden",
    });
  });

  it("preserves internal session errors without rewriting them to unauthorized", async () => {
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
            code: "INTERNAL_ERROR",
            httpStatus: 500,
            message: "操作失败，请稍后重试。",
          };
        },
      },
    });

    const response = await app.request("/api/auth/session", {
      headers: {
        cookie: "better-auth.session_token=token",
        "x-request-id": "req_session_internal",
      },
    });

    expect(response.status).toBe(500);
    expect(apiErrorResponseSchema.parse(await response.json())).toMatchObject({
      success: false,
      httpStatus: 500,
      code: "INTERNAL_ERROR",
      requestId: "req_session_internal",
    });
  });

  it("fails fast when default runtime configuration is invalid", () => {
    expect(() => createDefaultApiApp({ NODE_ENV: "production" })).toThrow();
  });

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

  it("rejects browser mutations from disallowed origins before domain calls", async () => {
    let createCalls = 0;
    const app = createApiApp({
      allowedOrigins: ["http://localhost:3000"],
      authService: createStaticAuthService(adminSession),
      userService: {
        async listUsers() {
          throw new Error("not used");
        },
        async createUser() {
          createCalls += 1;
          return { ok: true, user: userSummary };
        },
      },
    });

    const response = await app.request("/api/users", {
      method: "POST",
      body: JSON.stringify({
        name: "成员",
        email: "member@example.com",
        role: "member",
        password: "password123",
      }),
      headers: {
        "content-type": "application/json",
        cookie: "better-auth.session_token=token",
        origin: "https://evil.example",
        "x-request-id": "req_bad_origin",
      },
    });

    expect(response.status).toBe(403);
    expect(apiErrorResponseSchema.parse(await response.json())).toMatchObject({
      code: "FORBIDDEN",
      httpStatus: 403,
      requestId: "req_bad_origin",
    });
    expect(createCalls).toBe(0);
  });

  it("rejects JSON mutation routes without an application/json content type", async () => {
    let createCalls = 0;
    const app = createApiApp({
      authService: createStaticAuthService(adminSession),
      userService: {
        async listUsers() {
          throw new Error("not used");
        },
        async createUser() {
          createCalls += 1;
          return { ok: true, user: userSummary };
        },
      },
    });

    const response = await app.request("/api/users", {
      method: "POST",
      body: JSON.stringify({
        name: "成员",
        email: "member@example.com",
        role: "member",
        password: "password123",
      }),
      headers: {
        cookie: "better-auth.session_token=token",
        origin: "http://localhost:3000",
        "x-request-id": "req_wrong_content_type",
      },
    });

    expect(response.status).toBe(415);
    expect(apiErrorResponseSchema.parse(await response.json())).toMatchObject({
      code: "UNSUPPORTED_MEDIA_TYPE",
      httpStatus: 415,
      requestId: "req_wrong_content_type",
    });
    expect(createCalls).toBe(0);
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

  it("rate-limits user-management guard failures with unresolved IP identity", async () => {
    const consumedInputs: RateLimitConsumeInput[] = [];
    const app = createApiApp({
      allowedOrigins: ["http://localhost:3000"],
      authService: createStaticAuthService(adminSession),
      rateLimiter: {
        async consume(input) {
          consumedInputs.push(input);
          return {
            allowed: false,
            retryAfterSeconds: 25,
          };
        },
      },
      userService: {
        async createUser() {
          throw new Error("domain service should not run after guard failure");
        },
      },
    });

    const response = await app.request("/api/users", {
      method: "POST",
      body: JSON.stringify({
        name: "成员",
        email: "member@example.com",
        role: "member",
        password: "password123",
      }),
      headers: {
        "content-type": "application/json",
        origin: "https://evil.example",
        "x-forwarded-for": "203.0.113.11",
        "x-request-id": "req_users_guard_limited",
      },
    });

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("25");
    expect(apiErrorResponseSchema.parse(await response.json())).toMatchObject({
      code: "RATE_LIMITED",
      httpStatus: 429,
      requestId: "req_users_guard_limited",
    });
    expect(consumedInputs).toHaveLength(1);
    expect(consumedInputs[0]).toMatchObject({
      scope: "user-management",
      limit: 60,
      windowLabel: "1m",
      windowMs: 60_000,
    });
    expect(consumedInputs[0]?.identity).toMatch(/^ip:/);
  });

  it("rate-limits login before credential checks", async () => {
    let loginCalls = 0;
    const app = createApiApp({
      authService: {
        ...createStaticAuthService(adminSession),
        async login() {
          loginCalls += 1;
          return {
            ok: false,
            code: "UNAUTHORIZED",
            message: "邮箱或密码不正确。",
            httpStatus: 401,
          };
        },
      },
      rateLimiter: {
        async consume(input) {
          expect(input.scope).toBe("auth");
          return {
            allowed: false,
            retryAfterSeconds: 15,
          };
        },
      },
    });

    const response = await app.request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "admin@example.com", password: "password123" }),
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
        "x-request-id": "req_login_limited",
      },
    });

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("15");
    expect(apiErrorResponseSchema.parse(await response.json())).toMatchObject({
      code: "RATE_LIMITED",
      requestId: "req_login_limited",
    });
    expect(loginCalls).toBe(0);
  });

  it("rejects member user-management requests before domain calls", async () => {
    let listCalls = 0;
    const forbiddenAuditCalls: unknown[] = [];
    const consumedInputs: RateLimitConsumeInput[] = [];
    const app = createApiApp({
      auditService: {
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

  it("exports auth and user response schemas used by route handlers", () => {
    expect(
      apiSuccessResponseSchema(sessionPayloadSchema).parse({
        success: true,
        httpStatus: 200,
        data: {
          user: { id: "user_1", name: "管理员", email: "admin@example.com" },
          tenant: { id: "tenant_1" },
          role: "admin",
        },
        requestId: "req_schema",
      }).data.role,
    ).toBe("admin");

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

function createStaticAuthService(
  payload: typeof adminSession | typeof memberSession,
): AuthService {
  return {
    async login() {
      return {
        ok: false as const,
        code: "UNAUTHORIZED",
        message: "邮箱或密码不正确。",
        httpStatus: 401 as const,
      };
    },
    async logout() {
      return { ok: true as const };
    },
    async getSession() {
      return {
        ok: true as const,
        payload,
      };
    },
  };
}
