import { describe, expect, it } from "vitest";
import { Hono } from "hono";

import { isAppError } from "@kb/errors";
import { createLogger, type LogRecord } from "@kb/observability";
import { apiErrorResponseSchema } from "@kb/shared";

import { createApiApp } from "../app";
import type { ApiEnv } from "../contracts";
import { createJsonMutationGuardMiddleware } from "../middleware/mutation";
import type { RateLimitConsumeInput } from "../rate-limit";
import {
  adminSession,
  createStaticAuthService,
  userSummary,
} from "../testing/fakes";
import { validateJsonMutationRequest } from "./mutation";

describe("mutation guards", () => {
  it("throws an AppError from the JSON mutation helper for disallowed origins", async () => {
    let caughtError: unknown;
    const app = new Hono<ApiEnv>();
    app.onError((error, context) => {
      caughtError = error;
      return context.json({ caught: true }, 418);
    });
    app.post("/test", (context) => {
      validateJsonMutationRequest(context, ["http://localhost:3000"]);
      return context.json({ ok: true });
    });

    const response = await app.request("/test", {
      method: "POST",
      body: JSON.stringify({ value: true }),
      headers: {
        "content-type": "application/json",
        origin: "https://evil.example",
      },
    });

    expect(response.status).toBe(418);
    expect(isAppError(caughtError)).toBe(true);
    if (!isAppError(caughtError)) {
      throw new Error("expected mutation helper to throw AppError");
    }
    expect(caughtError.data).toMatchObject({
      code: "FORBIDDEN",
      httpStatus: 403,
      domain: "api",
      reason: "bad_origin",
    });
  });

  it("throws an AppError from the JSON mutation helper for invalid content types", async () => {
    let caughtError: unknown;
    const app = new Hono<ApiEnv>();
    app.onError((error, context) => {
      caughtError = error;
      return context.json({ caught: true }, 418);
    });
    app.post("/test", (context) => {
      validateJsonMutationRequest(context, ["http://localhost:3000"]);
      return context.json({ ok: true });
    });

    const response = await app.request("/test", {
      method: "POST",
      body: JSON.stringify({ value: true }),
      headers: {
        origin: "http://localhost:3000",
      },
    });

    expect(response.status).toBe(418);
    expect(isAppError(caughtError)).toBe(true);
    if (!isAppError(caughtError)) {
      throw new Error("expected mutation helper to throw AppError");
    }
    expect(caughtError.data).toMatchObject({
      code: "UNSUPPORTED_MEDIA_TYPE",
      httpStatus: 415,
      domain: "api",
      reason: "invalid_content_type",
    });
  });

  it("passes AppError objects to JSON mutation rejection hooks", async () => {
    let rejectedError: unknown;
    let caughtError: unknown;
    const app = new Hono<ApiEnv>();
    app.onError((error, context) => {
      caughtError = error;
      return context.json({ caught: true }, 418);
    });
    app.post(
      "/test",
      createJsonMutationGuardMiddleware({
        allowedOrigins: ["http://localhost:3000"],
        onRejected(_context, error) {
          rejectedError = error;
        },
      }),
      (context) => context.json({ ok: true }),
    );

    const response = await app.request("/test", {
      method: "POST",
      body: JSON.stringify({ value: true }),
      headers: {
        "content-type": "application/json",
        origin: "https://evil.example",
      },
    });

    expect(response.status).toBe(418);
    expect(isAppError(rejectedError)).toBe(true);
    expect(isAppError(caughtError)).toBe(true);
    if (!isAppError(rejectedError) || !isAppError(caughtError)) {
      throw new Error("expected mutation rejection hook to receive AppError");
    }
    expect(rejectedError.data).toMatchObject({
      code: "FORBIDDEN",
      httpStatus: 403,
      domain: "api",
      reason: "bad_origin",
    });
    expect(caughtError.data).toEqual(rejectedError.data);
  });

  it("rejects browser mutations from disallowed origins before domain calls", async () => {
    let createCalls = 0;
    const logRecords: LogRecord[] = [];
    const app = createApiApp({
      allowedOrigins: ["http://localhost:3000"],
      authService: createStaticAuthService(adminSession),
      logger: createLogger({ service: "api" }, (record) => logRecords.push(record)),
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
    expect(logRecords).toContainEqual(
      expect.objectContaining({
        event: "api_request_app_error",
        requestId: "req_bad_origin",
        fields: expect.objectContaining({
          code: "FORBIDDEN",
          httpStatus: 403,
          domain: "api",
          reason: "bad_origin",
        }),
      }),
    );
  });

  it("rejects JSON mutation routes without an application/json content type", async () => {
    let createCalls = 0;
    const logRecords: LogRecord[] = [];
    const app = createApiApp({
      authService: createStaticAuthService(adminSession),
      logger: createLogger({ service: "api" }, (record) => logRecords.push(record)),
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
    expect(logRecords).toContainEqual(
      expect.objectContaining({
        event: "api_request_app_error",
        requestId: "req_wrong_content_type",
        fields: expect.objectContaining({
          code: "UNSUPPORTED_MEDIA_TYPE",
          httpStatus: 415,
          domain: "api",
          reason: "invalid_content_type",
        }),
      }),
    );
  });

  it("rate-limits user-management guard failures with unresolved IP identity", async () => {
    const consumedInputs: RateLimitConsumeInput[] = [];
    const logRecords: LogRecord[] = [];
    const app = createApiApp({
      allowedOrigins: ["http://localhost:3000"],
      authService: createStaticAuthService(adminSession),
      logger: createLogger({ service: "api" }, (record) => logRecords.push(record)),
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
    expect(logRecords).toContainEqual(
      expect.objectContaining({
        event: "api_request_app_error",
        requestId: "req_users_guard_limited",
        fields: expect.objectContaining({
          code: "RATE_LIMITED",
          httpStatus: 429,
          domain: "api",
          reason: "rate_limited",
        }),
      }),
    );
  });
});
