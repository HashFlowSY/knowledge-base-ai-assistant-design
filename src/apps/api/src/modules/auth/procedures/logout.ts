import type { Context } from "hono";

import type { ApiEnv } from "../../../contracts";
import {
  appendSetCookieHeaders,
  createSuccessResponse,
  respondWithError,
} from "../../../http";
import type { AuthRouteDependencies } from "../dependencies";

export async function logoutProcedure(
  context: Context<ApiEnv>,
  dependencies: AuthRouteDependencies,
): Promise<Response> {
  const result = await dependencies.authService.logout({
    cookieHeader: context.req.header("cookie") ?? null,
  });
  if (!result.ok) {
    appendSetCookieHeaders(context, result.setCookieHeaders);
    return respondWithError(context, {
      code: result.code,
      httpStatus: result.httpStatus,
      message: result.message,
    });
  }
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
