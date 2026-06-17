import type { Context } from "hono";

import type { ApiEnv } from "../../../contracts";
import { createSuccessResponse } from "../../../http";
import { getRequiredActor, getValidatedInput } from "../../../middleware";
import type { UserRouteDependencies } from "../dependencies";
import type { UpdateUserInput, UserPathParams } from "../types";

type UpdateUserContext = Context<ApiEnv, "/api/users/:userId">;

export async function updateUserProcedure(
  context: UpdateUserContext,
  dependencies: UserRouteDependencies,
): Promise<Response> {
  const params = getValidatedInput<UserPathParams>(context, "userPathParams");
  const result = await dependencies.userService.updateUser({
    actor: getRequiredActor(context),
    body: getValidatedInput<UpdateUserInput>(context, "updateUserBody"),
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
