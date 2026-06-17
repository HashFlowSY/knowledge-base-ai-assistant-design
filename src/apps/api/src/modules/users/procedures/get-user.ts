import type { Context } from "hono";

import type { ApiEnv } from "../../../contracts";
import { createSuccessResponse } from "../../../http";
import { getRequiredActor, getValidatedInput } from "../../../middleware";
import type { UserRouteDependencies } from "../dependencies";
import type { UserPathParams } from "../types";

type GetUserContext = Context<ApiEnv, "/api/users/:userId">;

export async function getUserProcedure(
  context: GetUserContext,
  dependencies: UserRouteDependencies,
): Promise<Response> {
  const params = getValidatedInput<UserPathParams>(context, "userPathParams");
  const result = await dependencies.userService.getUser({
    actor: getRequiredActor(context),
    userId: params.userId,
  });

  return context.json(
    createSuccessResponse({
      data: result.user,
      httpStatus: 200,
      requestId: context.get("requestId"),
    }),
    200,
  );
}
