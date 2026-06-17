import { describe, expect, it } from "vitest";
import { z } from "zod";

import type { ApiValidationError } from "@kb/shared";

import {
  AppError,
  appErrorDataSchema,
  conflict,
  createAppError,
  forbidden,
  internalError,
  isAppError,
  normalizeUnknownError,
  notFound,
  payloadTooLarge,
  providerUnavailable,
  rateLimited,
  unauthorized,
  unsupportedMediaType,
  validationError,
} from "./index";

describe("AppError", () => {
  it("validates the unified error data shape", () => {
    const parsed = appErrorDataSchema.parse({
      code: "FORBIDDEN",
      httpStatus: 403,
      message: "你没有权限执行此操作。",
      domain: "users",
      reason: "self_protection",
      retryable: false,
      metadata: {
        requestId: "req_1",
        tenantId: "tenant_1",
        actorId: "actor_1",
        targetUserId: "user_2",
        operation: "remove_user_access",
        path: "/api/users/:userId/access",
        method: "DELETE",
        contentLength: 12,
        maxBytes: 1024,
        retryAttempt: 0,
      },
    });

    expect(parsed.code).toBe("FORBIDDEN");
  });

  it("rejects mismatched public code and HTTP status pairs", () => {
    expect(() =>
      appErrorDataSchema.parse({
        code: "FORBIDDEN",
        httpStatus: 404,
        message: "not allowed",
        domain: "users",
        reason: "self_protection",
      }),
    ).toThrow(z.ZodError);
  });

  it("requires reason values to be snake_case", () => {
    expect(() =>
      appErrorDataSchema.parse({
        code: "INTERNAL_ERROR",
        httpStatus: 500,
        message: "failed",
        domain: "api",
        reason: "UnexpectedError",
      }),
    ).toThrow(z.ZodError);
  });

  it("rejects metadata fields outside the explicit allowlist", () => {
    const forbiddenMetadataFieldNames = [
      "password",
      "currentPassword",
      "newPassword",
      "confirmPassword",
      "passwordHash",
      "apiKey",
      "providerApiKey",
      "openaiApiKey",
      "encryptedApiKey",
      "decryptedApiKey",
      "token",
      "accessToken",
      "refreshToken",
      "idToken",
      "bearerToken",
      "csrfToken",
      "sessionToken",
      "verificationToken",
      "resetToken",
      "cookie",
      "cookies",
      "sessionCookie",
      "Cookie",
      "Set-Cookie",
      "setCookie",
      "authorization",
      "Authorization",
      "proxyAuthorization",
      "Proxy-Authorization",
      "headers",
      "requestHeaders",
      "responseHeaders",
      "body",
      "requestBody",
      "responseBody",
      "rawBody",
      "jsonBody",
      "formData",
      "multipartBody",
      "providerRequestBody",
      "providerResponseBody",
      "providerPrompt",
      "providerCompletion",
      "prompt",
      "completion",
      "question",
      "answer",
      "messageContent",
      "chatMessage",
      "documentText",
      "rawText",
      "extractedText",
      "pageText",
      "markdown",
      "plainText",
      "chunkText",
      "chunkContent",
      "chunks",
      "embedding",
      "embeddings",
      "vector",
      "vectors",
      "file",
      "fileBuffer",
      "buffer",
      "bytes",
      "arrayBuffer",
      "blob",
      "base64",
      "DATABASE_URL",
      "databaseUrl",
      "connectionString",
      "sql",
      "rawSql",
      "queryText",
      "queryParams",
      "REDIS_URL",
      "redisUrl",
      "S3_SECRET_ACCESS_KEY",
      "AWS_SECRET_ACCESS_KEY",
      "AWS_ACCESS_KEY_ID",
      "awsSecretAccessKey",
      "awsAccessKeyId",
      "APP_ENCRYPTION_KEY",
      "encryptionKey",
      "privateKey",
      "decryptedSecret",
      "encryptedSecret",
    ];

    for (const fieldName of forbiddenMetadataFieldNames) {
      expect(() =>
        appErrorDataSchema.parse({
          code: "INTERNAL_ERROR",
          httpStatus: 500,
          message: "failed",
          domain: "providers",
          reason: "provider_save_failed",
          metadata: {
            [fieldName]: "secret_value",
          },
        }),
      ).toThrow(z.ZodError);
    }
  });

  it("rejects metadata objects outside the explicit allowlist", () => {
    expect(() =>
      appErrorDataSchema.parse({
        code: "INTERNAL_ERROR",
        httpStatus: 500,
        message: "failed",
        domain: "providers",
        reason: "provider_save_failed",
        metadata: {
          apiKey: "sk-test",
        },
      }),
    ).toThrow(z.ZodError);
  });

  it("rejects unsafe metadata values before they can be logged", () => {
    const baseError = {
      code: "INTERNAL_ERROR",
      httpStatus: 500,
      message: "failed",
      domain: "api",
      reason: "unexpected_error",
    } as const;

    expect(() =>
      appErrorDataSchema.parse({
        ...baseError,
        metadata: {
          actorId: "token=secret_token",
        },
      }),
    ).toThrow(z.ZodError);

    expect(() =>
      appErrorDataSchema.parse({
        ...baseError,
        metadata: {
          path: "/storage/private/object-key",
        },
      }),
    ).toThrow(z.ZodError);
  });

  it("rejects response headers outside the explicit allowlist", () => {
    expect(() =>
      appErrorDataSchema.parse({
        code: "RATE_LIMITED",
        httpStatus: 429,
        message: "too many requests",
        domain: "api",
        reason: "rate_limited",
        responseHeaders: {
          location: "/login",
        },
      }),
    ).toThrow(z.ZodError);
  });

  it("allows Retry-After only on RATE_LIMITED errors", () => {
    const parsed = appErrorDataSchema.parse({
      code: "RATE_LIMITED",
      httpStatus: 429,
      message: "too many requests",
      domain: "api",
      reason: "rate_limited",
      responseHeaders: {
        retryAfterSeconds: 60,
      },
    });

    expect(parsed.responseHeaders?.retryAfterSeconds).toBe(60);

    expect(() =>
      appErrorDataSchema.parse({
        code: "FORBIDDEN",
        httpStatus: 403,
        message: "not allowed",
        domain: "api",
        reason: "bad_origin",
        responseHeaders: {
          retryAfterSeconds: 60,
        },
      }),
    ).toThrow(z.ZodError);
  });

  it("allows Set-Cookie only on auth domain errors", () => {
    const parsed = appErrorDataSchema.parse({
      code: "UNAUTHORIZED",
      httpStatus: 401,
      message: "请先登录。",
      domain: "auth",
      reason: "session_expired",
      responseHeaders: {
        setCookie: ["better-auth.session_token=; Max-Age=0; Path=/"],
      },
    });

    expect(parsed.responseHeaders?.setCookie).toHaveLength(1);

    expect(() =>
      appErrorDataSchema.parse({
        code: "UNAUTHORIZED",
        httpStatus: 401,
        message: "请先登录。",
        domain: "api",
        reason: "session_expired",
        responseHeaders: {
          setCookie: ["better-auth.session_token=; Max-Age=0; Path=/"],
        },
      }),
    ).toThrow(z.ZodError);
  });

  it("rejects non-auth Set-Cookie names", () => {
    expect(() =>
      appErrorDataSchema.parse({
        code: "UNAUTHORIZED",
        httpStatus: 401,
        message: "请先登录。",
        domain: "auth",
        reason: "session_expired",
        responseHeaders: {
          setCookie: ["theme=dark; Path=/"],
        },
      }),
    ).toThrow(z.ZodError);
  });

  it("rejects unsafe Set-Cookie header values before response conversion", () => {
    const unsafeSetCookieHeaders = [
      "better-auth.session_token=abc\r\nX-Injected: 1",
      "better-auth.session_token=abc\nSet-Cookie: theme=dark",
      "better-auth.session_token=abc; Path=/\u0000",
    ];

    for (const setCookie of unsafeSetCookieHeaders) {
      expect(() =>
        appErrorDataSchema.parse({
          code: "UNAUTHORIZED",
          httpStatus: 401,
          message: "请先登录。",
          domain: "auth",
          reason: "session_expired",
          responseHeaders: {
            setCookie: [setCookie],
          },
        }),
      ).toThrow(z.ZodError);
    }
  });

  it("creates typed AppError instances and preserves the cause", () => {
    const cause = new Error("database unavailable");
    const error = createAppError(
      {
        code: "INTERNAL_ERROR",
        httpStatus: 500,
        message: "操作失败，请稍后重试。",
        domain: "db",
        reason: "unexpected_error",
      },
      { cause },
    );

    expect(error).toBeInstanceOf(AppError);
    expect(error.message).toBe("操作失败，请稍后重试。");
    expect(error.data.reason).toBe("unexpected_error");
    expect(error.cause).toBe(cause);
    expect(isAppError(error)).toBe(true);
  });

  it("normalizes unknown errors without leaking their message to clients", () => {
    const normalized = normalizeUnknownError(new Error("raw sql failed"));

    expect(normalized).toBeInstanceOf(AppError);
    expect(normalized.data).toMatchObject({
      code: "INTERNAL_ERROR",
      httpStatus: 500,
      message: "操作失败，请稍后重试。",
      domain: "api",
      reason: "unexpected_error",
    });
  });

  it("provides factories for standard public API errors", () => {
    const validationErrors: ApiValidationError[] = [
      { path: ["email"], message: "Invalid email" },
    ];

    expect(unauthorized({ domain: "auth", reason: "missing_session" }).data).toMatchObject({
      code: "UNAUTHORIZED",
      httpStatus: 401,
    });
    expect(forbidden({ domain: "api", reason: "bad_origin" }).data).toMatchObject({
      code: "FORBIDDEN",
      httpStatus: 403,
    });
    expect(notFound({ domain: "knowledge", reason: "knowledge_base_not_found" }).data).toMatchObject({
      code: "NOT_FOUND",
      httpStatus: 404,
    });
    expect(conflict({ domain: "users", reason: "duplicate_email" }).data).toMatchObject({
      code: "CONFLICT",
      httpStatus: 409,
    });
    expect(
      validationError({
        domain: "api",
        reason: "invalid_request_body",
        validationErrors,
      }).data.validationErrors,
    ).toEqual(validationErrors);
    expect(
      rateLimited({
        domain: "api",
        reason: "rate_limited",
        retryAfterSeconds: 30,
      }).data.responseHeaders?.retryAfterSeconds,
    ).toBe(30);
    expect(
      payloadTooLarge({ domain: "documents", reason: "upload_too_large" }).data,
    ).toMatchObject({
      code: "PAYLOAD_TOO_LARGE",
      httpStatus: 413,
    });
    expect(
      unsupportedMediaType({
        domain: "documents",
        reason: "unsupported_file_type",
      }).data,
    ).toMatchObject({
      code: "UNSUPPORTED_MEDIA_TYPE",
      httpStatus: 415,
    });
    expect(
      providerUnavailable({
        domain: "providers",
        reason: "provider_unavailable",
      }).data,
    ).toMatchObject({
      code: "PROVIDER_UNAVAILABLE",
      httpStatus: 500,
    });
    expect(internalError({ domain: "api", reason: "unexpected_error" }).data).toMatchObject({
      code: "INTERNAL_ERROR",
      httpStatus: 500,
    });
  });

  it("preserves shared factory input fields across the public factory API", () => {
    const commonInput = {
      domain: "api",
      reason: "factory_reason",
      message: "Factory message",
      metadata: {
        requestId: "req_factory",
        operation: "factory_test",
      },
      retryable: true,
    } as const;
    const validationErrors: ApiValidationError[] = [
      { path: ["email"], message: "Invalid email" },
    ];

    const errors = [
      unauthorized(commonInput),
      forbidden(commonInput),
      notFound(commonInput),
      conflict(commonInput),
      validationError({ ...commonInput, validationErrors }),
      rateLimited({ ...commonInput, retryAfterSeconds: 30 }),
      payloadTooLarge(commonInput),
      unsupportedMediaType(commonInput),
      providerUnavailable(commonInput),
      internalError(commonInput),
    ];

    expect(errors.map((error) => [error.data.code, error.data.httpStatus])).toEqual([
      ["UNAUTHORIZED", 401],
      ["FORBIDDEN", 403],
      ["NOT_FOUND", 404],
      ["CONFLICT", 409],
      ["VALIDATION_ERROR", 400],
      ["RATE_LIMITED", 429],
      ["PAYLOAD_TOO_LARGE", 413],
      ["UNSUPPORTED_MEDIA_TYPE", 415],
      ["PROVIDER_UNAVAILABLE", 500],
      ["INTERNAL_ERROR", 500],
    ]);

    for (const error of errors) {
      expect(error.data).toMatchObject(commonInput);
    }
    expect(errors[4]?.data.validationErrors).toEqual(validationErrors);
    expect(errors[5]?.data.responseHeaders?.retryAfterSeconds).toBe(30);
  });

  it("lets auth-domain factories carry cleanup Set-Cookie response headers", () => {
    const error = unauthorized({
      domain: "auth",
      reason: "session_expired",
      responseHeaders: {
        setCookie: ["better-auth.session_token=; Max-Age=0; Path=/"],
      },
    });

    expect(error.data.responseHeaders?.setCookie).toEqual([
      "better-auth.session_token=; Max-Age=0; Path=/",
    ]);
  });
});
