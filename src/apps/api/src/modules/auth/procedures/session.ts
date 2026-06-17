import type { Context } from "hono";

import type { ApiEnv } from "../../../contracts";
import {
  createSuccessResponse,
} from "../../../http";
import type { AuthRouteDependencies } from "../dependencies";

export async function sessionProcedure(
  context: Context<ApiEnv>,
  dependencies: AuthRouteDependencies,
): Promise<Response> {
  const result = await dependencies.authService.getSession({
    cookieHeader: context.req.header("cookie") ?? null,
  });

  return context.json(
    createSuccessResponse({
      data: result.payload,
      httpStatus: 200,
      requestId: context.get("requestId"),
    }),
    200,
  );
}
