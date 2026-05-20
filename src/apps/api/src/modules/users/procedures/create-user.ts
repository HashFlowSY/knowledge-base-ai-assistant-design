import type { Context } from "hono";

import { createUserInputSchema } from "@kb/users";

import type { ApiEnv } from "../../../contracts";
import { createSuccessResponse, readJsonBody } from "../../../http";
import {
  respondWithServiceError,
  respondWithValidationError,
  validateJsonMutationRequest,
} from "../../../request-helpers";
import {
  requireAdminUserManagementSession,
  respondAfterUnresolvedUserManagementRateLimit,
} from "../../../session-guards";
import type { UserRouteDependencies } from "../types";

export async function createUserProcedure(
  context: Context<ApiEnv>,
  dependencies: UserRouteDependencies,
): Promise<Response> {
  const csrfResponse = validateJsonMutationRequest(
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

  const authResult = await requireAdminUserManagementSession(
    context,
    dependencies.auditService,
    dependencies.authService,
    dependencies.rateLimiter,
  );
  if (!authResult.ok) {
    return authResult.response;
  }

  const body = await readJsonBody(context.req.raw);
  const parsed = createUserInputSchema.safeParse(body);
  if (!parsed.success) {
    return respondWithValidationError(context, parsed.error);
  }

  const result = await dependencies.userService.createUser({
    actor: authResult.actor,
    body: parsed.data,
  });
  if (!result.ok) {
    return respondWithServiceError(context, result);
  }

  return context.json(
    createSuccessResponse({
      data: result.user,
      httpStatus: 201,
      requestId: context.get("requestId"),
    }),
    201,
  );
}
