import type { Context } from "hono";

import type { ApiEnv } from "../../../contracts";
import { createSuccessResponse, respondWithError } from "../../../http";
import { getRequiredActor, getValidatedInput } from "../../../middleware";
import type { UserRouteDependencies } from "../dependencies";
import type { ListUsersQuery } from "../types";

export async function listUsersProcedure(
  context: Context<ApiEnv>,
  dependencies: UserRouteDependencies,
): Promise<Response> {
  const result = await dependencies.userService.listUsers({
    actor: getRequiredActor(context),
    query: getValidatedInput<ListUsersQuery>(context, "listUsersQuery"),
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
