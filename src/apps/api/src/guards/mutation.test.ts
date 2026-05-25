import { describe, expect, it } from "vitest";

import { apiErrorResponseSchema } from "@kb/shared";

import { createApiApp } from "../app";
import type { RateLimitConsumeInput } from "../rate-limit";
import {
  adminSession,
  createStaticAuthService,
  userSummary,
} from "../testing/fakes";

describe("mutation guards", () => {
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
});
