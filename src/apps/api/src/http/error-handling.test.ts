import { describe, expect, it } from "vitest";

import { forbidden, rateLimited, unauthorized } from "@kb/errors";
import { createLogger, type LogRecord } from "@kb/observability";
import { apiErrorResponseSchema } from "@kb/shared";

import { createApiApp } from "../app";

describe("api error handling", () => {
  it("maps thrown AppError values to the standard error envelope", async () => {
    const logRecords: LogRecord[] = [];
    const app = createApiApp({
      logger: createLogger({ service: "api" }, (record) => logRecords.push(record)),
      authService: {
        async login() {
          throw forbidden({
            domain: "users",
            reason: "self_protection",
            message: "不能对当前登录管理员执行此操作。",
            metadata: {
              requestId: "req_app_error",
              tenantId: "tenant_1",
              actorId: "admin_1",
              targetUserId: "admin_1",
              operation: "login",
              path: "/api/auth/login",
              method: "POST",
            },
          });
        },
        async logout() {
          return { ok: true };
        },
        async getSession() {
          throw unauthorized({
            domain: "auth",
            reason: "missing_session",
            message: "请先登录。",
          });
        },
      },
    });

    const response = await app.request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: "admin@example.com",
        password: "password123",
      }),
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
        "x-request-id": "req_app_error",
      },
    });

    expect(response.status).toBe(403);
    expect(apiErrorResponseSchema.parse(await response.json())).toMatchObject({
      success: false,
      httpStatus: 403,
      code: "FORBIDDEN",
      message: "不能对当前登录管理员执行此操作。",
      requestId: "req_app_error",
    });
    expect(logRecords).toContainEqual(
      expect.objectContaining({
        event: "api_request_app_error",
        requestId: "req_app_error",
        fields: {
          code: "FORBIDDEN",
          httpStatus: 403,
          domain: "users",
          reason: "self_protection",
          retryable: false,
          metadata: {
            requestId: "req_app_error",
            tenantId: "tenant_1",
            actorId: "admin_1",
            targetUserId: "admin_1",
            operation: "login",
            path: "/api/auth/login",
            method: "POST",
          },
          error: "不能对当前登录管理员执行此操作。",
          stack: expect.any(String),
        },
      }),
    );
  });

  it("forwards AppError response headers without including them in the JSON body or logs", async () => {
    const logRecords: LogRecord[] = [];
    const app = createApiApp({
      logger: createLogger({ service: "api" }, (record) => logRecords.push(record)),
      authService: {
        async login() {
          throw unauthorized({
            domain: "auth",
            reason: "session_expired",
            responseHeaders: {
              setCookie: ["better-auth.session_token=; Max-Age=0; Path=/"],
            },
          });
        },
        async logout() {
          throw rateLimited({
            domain: "api",
            reason: "rate_limited",
            retryAfterSeconds: 45,
          });
        },
        async getSession() {
          throw unauthorized({
            domain: "auth",
            reason: "missing_session",
            message: "请先登录。",
          });
        },
      },
    });

    const loginResponse = await app.request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: "admin@example.com",
        password: "password123",
      }),
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
        "x-request-id": "req_cookie_error",
      },
    });
    const loginBody = apiErrorResponseSchema.parse(await loginResponse.json());

    expect(loginResponse.status).toBe(401);
    expect(loginResponse.headers.get("set-cookie")).toContain(
      "better-auth.session_token=;",
    );
    expect(loginBody).not.toHaveProperty("responseHeaders");

    const logoutResponse = await app.request("/api/auth/logout", {
      method: "POST",
      headers: {
        origin: "http://localhost:3000",
        "x-request-id": "req_rate_limited",
      },
    });
    const logoutBody = apiErrorResponseSchema.parse(await logoutResponse.json());

    expect(logoutResponse.status).toBe(429);
    expect(logoutResponse.headers.get("retry-after")).toBe("45");
    expect(logoutBody).not.toHaveProperty("responseHeaders");

    for (const record of logRecords) {
      expect(record.fields).not.toHaveProperty("responseHeaders");
      expect(record.fields).not.toHaveProperty("setCookie");
      expect(JSON.stringify(record.fields)).not.toContain(
        "better-auth.session_token",
      );
    }
  });

  it("maps unhandled route errors to the standard error envelope and logs context", async () => {
    const logRecords: LogRecord[] = [];
    const app = createApiApp({
      logger: createLogger({ service: "api" }, (record) => logRecords.push(record)),
      authService: {
        async login() {
          throw new Error(
            "unexpected auth failure token=secret_token requestBody={} password=secret",
          );
        },
        async logout() {
          return { ok: true };
        },
        async getSession() {
          throw unauthorized({
            domain: "auth",
            reason: "missing_session",
            message: "请先登录。",
          });
        },
      },
    });

    const response = await app.request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: "admin@example.com",
        password: "password123",
      }),
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
        "x-request-id": "req_unhandled_error",
      },
    });

    expect(response.status).toBe(500);
    expect(apiErrorResponseSchema.parse(await response.json())).toMatchObject({
      success: false,
      httpStatus: 500,
      code: "INTERNAL_ERROR",
      requestId: "req_unhandled_error",
    });
    expect(logRecords).toContainEqual(
      expect.objectContaining({
        event: "api_request_unhandled_error",
        requestId: "req_unhandled_error",
        fields: expect.objectContaining({
          error: "Unhandled API error.",
          method: "POST",
          path: "/api/auth/login",
        }),
      }),
    );
    expect(JSON.stringify(logRecords)).not.toContain("secret_token");
    expect(JSON.stringify(logRecords)).not.toContain("requestBody");
    expect(JSON.stringify(logRecords)).not.toContain("password=secret");
  });

  it("does not trust unsafe request id headers for error responses or logs", async () => {
    const unsafeRequestId = "req_header token=secret_header requestBody={}";
    const logRecords: LogRecord[] = [];
    const app = createApiApp({
      logger: createLogger({ service: "api" }, (record) => logRecords.push(record)),
      authService: {
        async login() {
          throw new Error("unexpected auth failure");
        },
        async logout() {
          return { ok: true };
        },
        async getSession() {
          throw unauthorized({
            domain: "auth",
            reason: "missing_session",
            message: "请先登录。",
          });
        },
      },
    });

    const response = await app.request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: "admin@example.com",
        password: "password123",
      }),
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
        "x-request-id": unsafeRequestId,
      },
    });
    const body = apiErrorResponseSchema.parse(await response.json());

    expect(response.status).toBe(500);
    expect(body.requestId).not.toBe(unsafeRequestId);
    expect(response.headers.get("x-request-id")).toBe(body.requestId);
    expect(JSON.stringify(logRecords)).not.toContain("secret_header");
    expect(JSON.stringify(logRecords)).not.toContain("requestBody");
  });
});
