import type { Context } from "hono";

import type { ApiEnv } from "../../../contracts";
import { createSuccessResponse } from "../../../http";
import { respondWithServiceError } from "../../../request-helpers";
import { requireAdminUserManagementSession } from "../../../session-guards";
import type { UserRouteDependencies } from "../types";

type GetUserContext = Context<ApiEnv, "/api/users/:userId">;

export async function getUserProcedure(
  context: GetUserContext,
  dependencies: UserRouteDependencies,
): Promise<Response> {
  const authResult = await requireAdminUserManagementSession(
    context,
    dependencies.auditService,
    dependencies.authService,
    dependencies.rateLimiter,
  );
  if (!authResult.ok) {
    return authResult.response;
  }

  const result = await dependencies.userService.getUser({
    actor: authResult.actor,
    userId: context.req.param("userId"),
  });
  if (!result.ok) {
    return respondWithServiceError(context, result);
  }

  return context.json(
    createSuccessResponse({
      data: result.user,
      httpStatus: 200,
      requestId: context.get("requestId"),
    }),
    200,
  );
}
