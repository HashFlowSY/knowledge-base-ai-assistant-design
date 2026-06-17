import type { MiddlewareHandler } from "hono";

import type { Logger } from "@kb/observability";

import type { ApiEnv } from "../contracts";

const requestIdPattern = /^[A-Za-z0-9._-]+$/;
const maxRequestIdLength = 128;

export function createRequestContextMiddleware(
  logger: Logger,
): MiddlewareHandler<ApiEnv> {
  return async (context, next) => {
    const requestId = resolveRequestId(context.req.header("x-request-id"));

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

function resolveRequestId(value: string | undefined): string {
  const candidate = value?.trim();
  if (
    candidate !== undefined &&
    candidate.length > 0 &&
    candidate.length <= maxRequestIdLength &&
    requestIdPattern.test(candidate)
  ) {
    return candidate;
  }

  return crypto.randomUUID();
}
