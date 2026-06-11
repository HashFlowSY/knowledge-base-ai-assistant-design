import { Hono } from "hono";

import type { ApiEnv } from "../../contracts";
import {
  createAuthSessionRateLimitMiddleware,
  createAuthSessionRejectionRateLimitHandler,
  createJsonBodyValidationMiddleware,
  createJsonMutationGuardMiddleware,
  createLoginRateLimitMiddleware,
  createLoginRejectionRateLimitHandler,
  createMutationGuardMiddleware,
  createNoBodyGuardMiddleware,
} from "../../middleware";
import { loginProcedure } from "./procedures/login";
import { logoutProcedure } from "./procedures/logout";
import { sessionProcedure } from "./procedures/session";
import type { AuthRouteDependencies } from "./dependencies";
import { loginInputSchema } from "./types";

export function createAuthRouter(
  dependencies: AuthRouteDependencies,
): Hono<ApiEnv> {
  const router = new Hono<ApiEnv>();
  const rejectWithLoginRateLimit = createLoginRejectionRateLimitHandler(
    dependencies.rateLimiter,
  );
  const rejectWithAuthSessionRateLimit =
    createAuthSessionRejectionRateLimitHandler(dependencies.rateLimiter);
  const authSessionRateLimit = createAuthSessionRateLimitMiddleware(
    dependencies.rateLimiter,
  );

  router.post(
    "/api/auth/login",
    createJsonMutationGuardMiddleware({
      allowedOrigins: dependencies.allowedOrigins,
      onRejected: rejectWithLoginRateLimit,
    }),
    createLoginRateLimitMiddleware(dependencies.rateLimiter),
    createJsonBodyValidationMiddleware("loginBody", loginInputSchema),
    (context) => loginProcedure(context, dependencies),
  );
  router.post(
    "/api/auth/logout",
    createMutationGuardMiddleware({
      allowedOrigins: dependencies.allowedOrigins,
      onRejected: rejectWithAuthSessionRateLimit,
    }),
    createNoBodyGuardMiddleware({
      onRejected: rejectWithAuthSessionRateLimit,
    }),
    authSessionRateLimit,
    (context) => logoutProcedure(context, dependencies),
  );
  router.get("/api/auth/session", authSessionRateLimit, (context) =>
    sessionProcedure(context, dependencies),
  );

  return router;
}
