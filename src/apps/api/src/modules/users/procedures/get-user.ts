import type { Context } from "hono";

import type { ApiEnv } from "../../../contracts";
import { createSuccessResponse, respondWithServiceError } from "../../../http";
import { getRequiredActor } from "../../../middleware";
import type { UserRouteDependencies } from "../dependencies";

type GetUserContext = Context<ApiEnv, "/api/users/:userId">;

export async function getUserProcedure(
  context: GetUserContext,
  dependencies: UserRouteDependencies,
): Promise<Response> {
  const result = await dependencies.userService.getUser({
    actor: getRequiredActor(context),
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
