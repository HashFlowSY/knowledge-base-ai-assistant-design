import type { Context } from "hono";

import type { ApiEnv } from "../../../contracts";
import {
  appendSetCookieHeaders,
  createSuccessResponse,
} from "../../../http";
import { getValidatedInput } from "../../../middleware";
import type { AuthRouteDependencies } from "../dependencies";
import type { LoginInput } from "../types";

export async function loginProcedure(
  context: Context<ApiEnv>,
  dependencies: AuthRouteDependencies,
): Promise<Response> {
  const result = await dependencies.authService.login(
    getValidatedInput<LoginInput>(context, "loginBody"),
  );

  appendSetCookieHeaders(context, result.setCookieHeaders);

  return context.json(
    createSuccessResponse({
      data: result.payload,
      httpStatus: 200,
      requestId: context.get("requestId"),
    }),
    200,
  );
}
