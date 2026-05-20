import type { Context } from "hono";

import type { ApiEnv } from "../../../contracts";
import {
  createSuccessResponse,
  hasRequestBody,
  respondWithError,
} from "../../../http";
import {
  respondWithServiceError,
  validateMutationRequest,
} from "../../../request-helpers";
import {
  requireAdminUserManagementSession,
  respondAfterUnresolvedUserManagementRateLimit,
} from "../../../session-guards";
import type { UserRouteDependencies } from "../types";

type RemoveUserAccessContext = Context<ApiEnv, "/api/users/:userId/access">;

export async function removeUserAccessProcedure(
  context: RemoveUserAccessContext,
  dependencies: UserRouteDependencies,
): Promise<Response> {
  const csrfResponse = validateMutationRequest(
    context,
    dependencies.allowedOrigins,
  );
  if (csrfResponse !== null) {
    return respondAfterUnresolvedUserManagementRateLimit(
      context,
      dependencies.rateLimiter,
      csrfResponse,
    );
  }

  if (hasRequestBody(context.req.raw)) {
    return respondAfterUnresolvedUserManagementRateLimit(
      context,
      dependencies.rateLimiter,
      respondWithError(context, {
        code: "VALIDATION_ERROR",
        httpStatus: 400,
        message: "请检查填写内容。",
      }),
    );
  }

  const authResult = await requireAdminUserManagementSession(
    context,
    dependencies.auditService,
    dependencies.authService,
    dependencies.rateLimiter,
  );
  if (!authResult.ok) {
    return authResult.response;
  }

  const result = await dependencies.userService.removeUserAccess({
    actor: authResult.actor,
    userId: context.req.param("userId"),
  });
  if (!result.ok) {
    return respondWithServiceError(context, result);
  }

  return context.json(
    createSuccessResponse({
      data: null,
      httpStatus: 200,
      requestId: context.get("requestId"),
    }),
    200,
  );
}
