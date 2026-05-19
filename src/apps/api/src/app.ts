import { Hono } from "hono";
import { z } from "zod";

import { loginInputSchema } from "@kb/auth";
import { createLogger } from "@kb/observability";
import { createUtcTimestamp } from "@kb/shared";

import type { ApiAppOptions, ApiEnv, UserService } from "./contracts";
export type {
  ApiApp,
  ApiAppOptions,
  ApiContextVariables,
  ApiEnv,
  ApiRateLimiter,
  ApiRuntimeResource,
  ApiServiceError,
  AuditService,
  AuthService,
  UserService,
} from "./contracts";
import {
  createEmptyUserService,
  createNoopAuditService,
  createUnauthenticatedAuthService,
} from "./default-services";
import {
  createSuccessResponse,
  hasRequestBody,
  readJsonBody,
  respondWithError,
} from "./http";
import {
  createInMemoryRateLimitStore,
  createRateLimiter,
} from "./rate-limit";
import {
  appendSetCookieHeaders,
  validateJsonMutationRequest,
  validateMutationRequest,
} from "./request-helpers";
import { createApiRuntimeServicesFromEnv } from "./runtime-services";
import {
  getLoginRateLimitEmail,
  rateLimitAuthSession,
  rateLimitLogin,
} from "./session-guards";
import { registerUserRoutes } from "./user-routes";

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("api"),
  timestamp: z.string().datetime(),
  requestId: z.string().min(1),
  dependencies: z.object({
    config: z.literal("not_checked"),
    database: z.literal("not_checked"),
    redis: z.literal("not_checked"),
    meilisearch: z.literal("not_checked"),
    objectStorage: z.literal("not_checked"),
  }),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export function createApiApp(options: ApiAppOptions = {}) {
  const app = new Hono<ApiEnv>();
  const logger = createLogger({ service: "api" });
  const authService = options.authService ?? createUnauthenticatedAuthService();
  const auditService = options.auditService ?? createNoopAuditService();
  const allowedOrigins = options.allowedOrigins ?? ["http://localhost:3000"];
  const rateLimiter =
    options.rateLimiter ??
    createRateLimiter({
      store: createInMemoryRateLimitStore(),
    });
  const userService: UserService = {
    ...createEmptyUserService(),
    ...options.userService,
  };

  app.use("*", async (context, next) => {
    const existingRequestId = context.req.header("x-request-id");
    const requestId =
      existingRequestId && existingRequestId.length > 0
        ? existingRequestId
        : crypto.randomUUID();

    context.set("requestId", requestId);
    context.header("X-Request-Id", requestId);

    await next();

    logger.info("api_request_finished", {
      requestId,
      method: context.req.method,
      path: context.req.path,
      status: context.res.status,
    });
  });

  app.get("/health", (context) => {
    const response = healthResponseSchema.parse({
      status: "ok",
      service: "api",
      timestamp: createUtcTimestamp(),
      requestId: context.get("requestId"),
      dependencies: {
        config: "not_checked",
        database: "not_checked",
        redis: "not_checked",
        meilisearch: "not_checked",
        objectStorage: "not_checked",
      },
    });

    return context.json(response);
  });

  app.post("/api/auth/login", async (context) => {
    const csrfResponse = validateJsonMutationRequest(context, allowedOrigins);
    if (csrfResponse !== null) {
      const rateLimitResponse = await rateLimitLogin(context, rateLimiter, null);
      return rateLimitResponse ?? csrfResponse;
    }

    const body = await readJsonBody(context.req.raw);
    const rateLimitResponse = await rateLimitLogin(
      context,
      rateLimiter,
      getLoginRateLimitEmail(body),
    );
    if (rateLimitResponse !== null) {
      return rateLimitResponse;
    }

    const parsed = loginInputSchema.safeParse(body);
    if (!parsed.success) {
      return respondWithError(context, {
        code: "VALIDATION_ERROR",
        httpStatus: 400,
        message: "请检查填写内容。",
        validationErrors: parsed.error.issues.map((issue) => ({
          path: issue.path,
          message: issue.message,
        })),
      });
    }

    const result = await authService.login(parsed.data);
    if (!result.ok) {
      appendSetCookieHeaders(context, result.setCookieHeaders);
      return respondWithError(context, {
        code: result.code,
        httpStatus: result.httpStatus,
        message: result.message,
      });
    }

    appendSetCookieHeaders(context, result.setCookieHeaders);

    return context.json(
      createSuccessResponse({
        data: result.payload,
        httpStatus: 200,
        requestId: context.get("requestId"),
      }),
      200,
    );
  });

  app.post("/api/auth/logout", async (context) => {
    const csrfResponse = validateMutationRequest(context, allowedOrigins);
    if (csrfResponse !== null) {
      const rateLimitResponse = await rateLimitAuthSession(context, rateLimiter);
      return rateLimitResponse ?? csrfResponse;
    }

    if (hasRequestBody(context.req.raw)) {
      const rateLimitResponse = await rateLimitAuthSession(context, rateLimiter);
      if (rateLimitResponse !== null) {
        return rateLimitResponse;
      }

      return respondWithError(context, {
        code: "VALIDATION_ERROR",
        httpStatus: 400,
        message: "请检查填写内容。",
      });
    }
    const rateLimitResponse = await rateLimitAuthSession(context, rateLimiter);
    if (rateLimitResponse !== null) {
      return rateLimitResponse;
    }

    const result = await authService.logout({
      cookieHeader: context.req.header("cookie") ?? null,
    });
    if (!result.ok) {
      appendSetCookieHeaders(context, result.setCookieHeaders);
      return respondWithError(context, {
        code: result.code,
        httpStatus: result.httpStatus,
        message: result.message,
      });
    }
    appendSetCookieHeaders(context, result.setCookieHeaders);

    return context.json(
      createSuccessResponse({
        data: null,
        httpStatus: 200,
        requestId: context.get("requestId"),
      }),
      200,
    );
  });

  app.get("/api/auth/session", async (context) => {
    const rateLimitResponse = await rateLimitAuthSession(context, rateLimiter);
    if (rateLimitResponse !== null) {
      return rateLimitResponse;
    }

    const result = await authService.getSession({
      cookieHeader: context.req.header("cookie") ?? null,
    });
    if (!result.ok) {
      appendSetCookieHeaders(context, result.setCookieHeaders);
      return respondWithError(context, {
        code: result.code,
        httpStatus: result.httpStatus,
        message: result.message,
      });
    }

    return context.json(
      createSuccessResponse({
        data: result.payload,
        httpStatus: 200,
        requestId: context.get("requestId"),
      }),
      200,
    );
  });

  registerUserRoutes(app, {
    allowedOrigins,
    auditService,
    authService,
    rateLimiter,
    userService,
  });

  return app;
}

export function createDefaultApiApp(
  env: NodeJS.ProcessEnv = process.env,
): Hono<ApiEnv> {
  return createApiApp(createApiRuntimeServicesFromEnv(env));
}
