import { describe, expect, it } from "vitest";

import { sessionPayloadSchema } from "@kb/auth";
import { apiErrorResponseSchema, apiSuccessResponseSchema } from "@kb/shared";

import { createApiApp, type AuthService } from "../../app";
import type { ApiEnv } from "../../contracts";
import type { RateLimitConsumeInput } from "../../rate-limit";
import { adminSession, createStaticAuthService } from "../../testing/fakes";

describe("auth API router", () => {
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

  it("uses server remote address instead of spoofed forwarded headers for auth IP limits", async () => {
    const consumedInputs: RateLimitConsumeInput[] = [];
    const app = createApiApp({
      rateLimiter: {
        async consume(input) {
          consumedInputs.push(input);
          return {
            allowed: true,
            retryAfterSeconds: 60,
          };
        },
      },
    });

    const firstResponse = await app.fetch(
      new Request("http://localhost/api/auth/session", {
        headers: {
          "x-forwarded-for": "203.0.113.10",
          "x-request-id": "req_session_spoofed_ip_1",
        },
      }),
      createRemoteAddressBindings("198.51.100.20"),
    );
    const secondResponse = await app.fetch(
      new Request("http://localhost/api/auth/session", {
        headers: {
          "x-forwarded-for": "203.0.113.11",
          "x-request-id": "req_session_spoofed_ip_2",
        },
      }),
      createRemoteAddressBindings("198.51.100.20"),
    );
    const thirdResponse = await app.fetch(
      new Request("http://localhost/api/auth/session", {
        headers: {
          "x-forwarded-for": "203.0.113.11",
          "x-request-id": "req_session_spoofed_ip_3",
        },
      }),
      createRemoteAddressBindings("198.51.100.21"),
    );

    expect(firstResponse.status).toBe(401);
    expect(secondResponse.status).toBe(401);
    expect(thirdResponse.status).toBe(401);
    expect(consumedInputs).toHaveLength(3);
    expect(consumedInputs[0]?.identity).toMatch(/^ip:/);
    expect(consumedInputs[1]?.identity).toBe(consumedInputs[0]?.identity);
    expect(consumedInputs[2]?.identity).not.toBe(consumedInputs[0]?.identity);
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

  it("treats malformed session cookies as missing credentials after auth rate limiting", async () => {
    const consumedInputs: RateLimitConsumeInput[] = [];
    const app = createApiApp({
      rateLimiter: {
        async consume(input) {
          consumedInputs.push(input);
          return {
            allowed: true,
            retryAfterSeconds: 60,
          };
        },
      },
    });

    const response = await app.request("/api/auth/session", {
      headers: {
        cookie: "better-auth.session_token=%",
        "x-forwarded-for": "203.0.113.10",
        "x-request-id": "req_malformed_session_cookie",
      },
    });

    expect(response.status).toBe(401);
    expect(apiErrorResponseSchema.parse(await response.json())).toMatchObject({
      success: false,
      httpStatus: 401,
      code: "UNAUTHORIZED",
      message: "请先登录。",
      requestId: "req_malformed_session_cookie",
    });
    expect(consumedInputs).toHaveLength(1);
    expect(consumedInputs[0]).toMatchObject({
      scope: "auth",
      limit: 120,
      windowLabel: "1m",
      windowMs: 60_000,
    });
    expect(consumedInputs[0]?.identity).toMatch(/^ip:/);
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

  it("exports the auth response schema used by route handlers", () => {
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
  });
});

function createRemoteAddressBindings(remoteAddress: string): ApiEnv["Bindings"] {
  return {
    incoming: {
      socket: {
        remoteAddress,
      },
    },
  };
}
