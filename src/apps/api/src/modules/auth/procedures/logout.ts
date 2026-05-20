import type { Context } from "hono";

import type { ApiEnv } from "../../../contracts";
import {
  createSuccessResponse,
  hasRequestBody,
  respondWithError,
} from "../../../http";
import {
  appendSetCookieHeaders,
  validateMutationRequest,
} from "../../../request-helpers";
import { rateLimitAuthSession } from "../../../session-guards";
import type { AuthRouteDependencies } from "../types";

export async function logoutProcedure(
  context: Context<ApiEnv>,
  dependencies: AuthRouteDependencies,
): Promise<Response> {
  const csrfResponse = validateMutationRequest(
    context,
    dependencies.allowedOrigins,
  );
  if (csrfResponse !== null) {
    const rateLimitResponse = await rateLimitAuthSession(
      context,
      dependencies.rateLimiter,
    );
    return rateLimitResponse ?? csrfResponse;
  }

  if (hasRequestBody(context.req.raw)) {
    const rateLimitResponse = await rateLimitAuthSession(
      context,
      dependencies.rateLimiter,
    );
    if (rateLimitResponse !== null) {
      return rateLimitResponse;
    }

    return respondWithError(context, {
      code: "VALIDATION_ERROR",
      httpStatus: 400,
      message: "请检查填写内容。",
    });
  }
  const rateLimitResponse = await rateLimitAuthSession(
    context,
    dependencies.rateLimiter,
  );
  if (rateLimitResponse !== null) {
    return rateLimitResponse;
  }

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
