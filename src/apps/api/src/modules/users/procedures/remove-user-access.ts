import type { Context } from "hono";

import type { ApiEnv } from "../../../contracts";
import {
  createSuccessResponse,
  respondWithServiceError,
} from "../../../http";
import { getRequiredActor } from "../../../middleware";
import type { UserRouteDependencies } from "../dependencies";

type RemoveUserAccessContext = Context<ApiEnv, "/api/users/:userId/access">;

export async function removeUserAccessProcedure(
  context: RemoveUserAccessContext,
  dependencies: UserRouteDependencies,
): Promise<Response> {
  const result = await dependencies.userService.removeUserAccess({
    actor: getRequiredActor(context),
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
