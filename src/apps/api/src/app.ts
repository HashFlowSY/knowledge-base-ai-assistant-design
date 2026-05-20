import { Hono } from "hono";

import { createLogger } from "@kb/observability";

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
  createInMemoryRateLimitStore,
  createRateLimiter,
} from "./rate-limit";
import { createApiRuntimeServicesFromEnv } from "./runtime-services";
import { createAuthRouter } from "./modules/auth/router";
import { createHealthRouter } from "./modules/health/router";
export { healthResponseSchema } from "./modules/health/types";
export type { HealthResponse } from "./modules/health/types";
import { registerUserRoutes } from "./user-routes";

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

  app.route("/", createHealthRouter());
  app.route(
    "/",
    createAuthRouter({
      allowedOrigins,
      authService,
      rateLimiter,
    }),
  );

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
