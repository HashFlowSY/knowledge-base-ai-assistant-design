import type { MiddlewareHandler } from "hono";

import type { Logger } from "@kb/observability";

import type { ApiEnv } from "../contracts";

export function createRequestContextMiddleware(
  logger: Logger,
): MiddlewareHandler<ApiEnv> {
  return async (context, next) => {
    const existingRequestId = context.req.header("x-request-id");
    const requestId =
      existingRequestId && existingRequestId.length > 0
        ? existingRequestId
        : crypto.randomUUID();

    context.set("actor", null);
    context.set("documentUpload", null);
    context.set("jsonBody", undefined);
    context.set("jsonBodyRead", false);
    context.set("rateLimitCounted", false);
    context.set("requestId", requestId);
    context.set("session", null);
    context.set("tenantId", null);
    context.set("validatedInputs", {});
    context.set("logger", logger.child({ requestId }));
    context.header("X-Request-Id", requestId);

    await next();

    context.get("logger").info("api_request_finished", {
      method: context.req.method,
      path: context.req.path,
      status: context.res.status,
    });
  };
}
