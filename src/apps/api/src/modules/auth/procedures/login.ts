import type { Context } from "hono";

import type { ApiEnv } from "../../../contracts";
import {
  appendSetCookieHeaders,
  createSuccessResponse,
  readJsonBody,
  respondWithError,
} from "../../../http";
import {
  getLoginRateLimitEmail,
  rateLimitLogin,
  validateJsonMutationRequest,
} from "../../../guards";
import type { AuthRouteDependencies } from "../dependencies";
import { loginInputSchema } from "../types";

export async function loginProcedure(
  context: Context<ApiEnv>,
  dependencies: AuthRouteDependencies,
): Promise<Response> {
  const csrfResponse = validateJsonMutationRequest(
    context,
    dependencies.allowedOrigins,
  );
  if (csrfResponse !== null) {
    const rateLimitResponse = await rateLimitLogin(
      context,
      dependencies.rateLimiter,
      null,
    );
    return rateLimitResponse ?? csrfResponse;
  }

  const body = await readJsonBody(context.req.raw);
  const rateLimitResponse = await rateLimitLogin(
    context,
    dependencies.rateLimiter,
    getLoginRateLimitEmail(body),
  );
  if (rateLimitResponse !== null) {
    return rateLimitResponse;
  }

  const parsed = loginInputSchema.safeParse(body);
  if (!parsed.success) {
    return respondWithError(context, {
      code: "VALIDATION_ERROR",
      httpStatus: 400,
      message: "请检查填写内容。",
      validationErrors: parsed.error.issues.map((issue) => ({
        path: issue.path,
        message: issue.message,
      })),
    });
  }

  const result = await dependencies.authService.login(parsed.data);
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
      data: result.payload,
      httpStatus: 200,
      requestId: context.get("requestId"),
    }),
    200,
  );
}
