import type { Context } from "hono";

import type { ApiEnv } from "../../../contracts";
import {
  createSuccessResponse,
  respondWithServiceError,
} from "../../../http";
import { getRequiredActor, getValidatedInput } from "../../../middleware";
import type { UserRouteDependencies } from "../dependencies";
import type { CreateUserInput } from "../types";

export async function createUserProcedure(
  context: Context<ApiEnv>,
  dependencies: UserRouteDependencies,
): Promise<Response> {
  const result = await dependencies.userService.createUser({
    actor: getRequiredActor(context),
    body: getValidatedInput<CreateUserInput>(context, "createUserBody"),
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
