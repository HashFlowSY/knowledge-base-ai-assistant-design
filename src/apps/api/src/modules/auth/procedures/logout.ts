import type { Context } from "hono";

import type { ApiEnv } from "../../../contracts";
import {
  appendSetCookieHeaders,
  createSuccessResponse,
} from "../../../http";
import type { AuthRouteDependencies } from "../dependencies";

export async function logoutProcedure(
  context: Context<ApiEnv>,
  dependencies: AuthRouteDependencies,
): Promise<Response> {
  const result = await dependencies.authService.logout({
    cookieHeader: context.req.header("cookie") ?? null,
  });
  appendSetCookieHeaders(context, result.setCookieHeaders);

  return context.json(
    createSuccessResponse({
      data: null,
      httpStatus: 200,
      requestId: context.get("requestId"),
    }),
    200,
  );
}
