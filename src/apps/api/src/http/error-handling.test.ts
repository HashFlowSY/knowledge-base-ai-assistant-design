import { describe, expect, it } from "vitest";

import { createLogger, type LogRecord } from "@kb/observability";
import { apiErrorResponseSchema } from "@kb/shared";

import { createApiApp } from "../app";

describe("api error handling", () => {
  it("maps unhandled route errors to the standard error envelope and logs context", async () => {
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
          return {
            ok: false,
            code: "UNAUTHORIZED",
            httpStatus: 401,
            message: "请先登录。",
          };
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
          error: "unexpected auth failure",
          method: "POST",
          path: "/api/auth/login",
        }),
      }),
    );
  });
});
