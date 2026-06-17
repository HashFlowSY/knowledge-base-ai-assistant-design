import type { Context } from "hono";

import type { ApiEnv } from "../../../contracts";
import { createSuccessResponse } from "../../../http";
import { getRequiredActor, getValidatedInput } from "../../../middleware";
import type { UserRouteDependencies } from "../dependencies";
import type { UserPathParams } from "../types";

type RemoveUserAccessContext = Context<ApiEnv, "/api/users/:userId/access">;

export async function removeUserAccessProcedure(
  context: RemoveUserAccessContext,
  dependencies: UserRouteDependencies,
): Promise<Response> {
  const params = getValidatedInput<UserPathParams>(context, "userPathParams");
  await dependencies.userService.removeUserAccess({
    actor: getRequiredActor(context),
    userId: params.userId,
  });

  return context.json(
    createSuccessResponse({
      data: null,
      httpStatus: 200,
      requestId: context.get("requestId"),
    }),
    200,
  );
}
