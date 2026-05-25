import type { Context } from "hono";

import type { ApiEnv } from "../../../contracts";
import { createSuccessResponse, respondWithError } from "../../../http";
import { requireAdminUserManagementSession } from "../../../guards";
import type { UserRouteDependencies } from "../dependencies";
import { listUsersQuerySchema } from "../types";

export async function listUsersProcedure(
  context: Context<ApiEnv>,
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

  const query = listUsersQuerySchema.parse(
    Object.fromEntries(new URL(context.req.url).searchParams),
  );
  const result = await dependencies.userService.listUsers({
    actor: authResult.actor,
    query,
  });
  if (!result.ok) {
    return respondWithError(context, {
      code: result.code,
      httpStatus: result.httpStatus,
      message: result.message,
    });
  }

  return context.json(
    createSuccessResponse({
      data: result.page,
      httpStatus: 200,
      requestId: context.get("requestId"),
    }),
    200,
  );
}
