import { Hono } from "hono";

import type { ApiEnv } from "../../contracts";
import {
  createAdminUserManagementSessionMiddleware,
  createJsonBodyValidationMiddleware,
  createJsonMutationGuardMiddleware,
  createMutationGuardMiddleware,
  createNoBodyGuardMiddleware,
  createQueryValidationMiddleware,
  createUserManagementRejectionRateLimitHandler,
} from "../../middleware";
import { createUserProcedure } from "./procedures/create-user";
import { getUserProcedure } from "./procedures/get-user";
import { listUsersProcedure } from "./procedures/list-users";
import { removeUserAccessProcedure } from "./procedures/remove-user-access";
import { updateUserProcedure } from "./procedures/update-user";
import type { UserRouteDependencies } from "./dependencies";
import {
  createUserInputSchema,
  listUsersQuerySchema,
  updateUserInputSchema,
} from "./types";

export function createUsersRouter(
  dependencies: UserRouteDependencies,
): Hono<ApiEnv> {
  const router = new Hono<ApiEnv>();
  const requireAdmin = createAdminUserManagementSessionMiddleware({
    auditService: dependencies.auditService,
    authService: dependencies.authService,
    rateLimiter: dependencies.rateLimiter,
  });
  const rejectWithUserManagementRateLimit =
    createUserManagementRejectionRateLimitHandler(dependencies.rateLimiter);
  const jsonMutationGuard = createJsonMutationGuardMiddleware({
    allowedOrigins: dependencies.allowedOrigins,
    onRejected: rejectWithUserManagementRateLimit,
  });
  const mutationGuard = createMutationGuardMiddleware({
    allowedOrigins: dependencies.allowedOrigins,
    onRejected: rejectWithUserManagementRateLimit,
  });
  const noBodyGuard = createNoBodyGuardMiddleware({
    onRejected: rejectWithUserManagementRateLimit,
  });

  router.get(
    "/api/users",
    requireAdmin,
    createQueryValidationMiddleware("listUsersQuery", listUsersQuerySchema),
    (context) => listUsersProcedure(context, dependencies),
  );
  router.post(
    "/api/users",
    jsonMutationGuard,
    requireAdmin,
    createJsonBodyValidationMiddleware("createUserBody", createUserInputSchema),
    (context) => createUserProcedure(context, dependencies),
  );
  router.get("/api/users/:userId", requireAdmin, (context) =>
    getUserProcedure(context, dependencies),
  );
  router.patch(
    "/api/users/:userId",
    jsonMutationGuard,
    requireAdmin,
    createJsonBodyValidationMiddleware("updateUserBody", updateUserInputSchema),
    (context) => updateUserProcedure(context, dependencies),
  );
  router.delete(
    "/api/users/:userId/access",
    mutationGuard,
    noBodyGuard,
    requireAdmin,
    (context) => removeUserAccessProcedure(context, dependencies),
  );

  return router;
}
