import type { Context, MiddlewareHandler } from "hono";

import type { ApiEnv, ApiRateLimiter } from "../contracts";
import {
  getLoginRateLimitEmail,
  rateLimitAuthSession,
  rateLimitLogin,
  respondAfterUnresolvedDocumentUploadRateLimit,
  respondAfterUnresolvedKnowledgeBaseRateLimit,
  respondAfterUnresolvedUserManagementRateLimit,
} from "../guards";
import { readJsonBodyOnce } from "./validation";

export type RejectedResponseHandler = (
  context: Context<ApiEnv>,
  response: Response,
) => Promise<Response>;

export function createAuthSessionRateLimitMiddleware(
  rateLimiter: ApiRateLimiter,
): MiddlewareHandler<ApiEnv> {
  return async (context, next) => {
    const rateLimitResponse = await rateLimitAuthSession(context, rateLimiter);
    if (rateLimitResponse !== null) {
      return rateLimitResponse;
    }

    return next();
  };
}

export function createLoginRateLimitMiddleware(
  rateLimiter: ApiRateLimiter,
): MiddlewareHandler<ApiEnv> {
  return async (context, next) => {
    const body = await readJsonBodyOnce(context);
    const rateLimitResponse = await rateLimitLogin(
      context,
      rateLimiter,
      getLoginRateLimitEmail(body),
    );
    if (rateLimitResponse !== null) {
      return rateLimitResponse;
    }

    return next();
  };
}

export function createAuthSessionRejectionRateLimitHandler(
  rateLimiter: ApiRateLimiter,
): RejectedResponseHandler {
  return async (context, response) => {
    const rateLimitResponse = await rateLimitAuthSession(context, rateLimiter);
    return rateLimitResponse ?? response;
  };
}

export function createLoginRejectionRateLimitHandler(
  rateLimiter: ApiRateLimiter,
): RejectedResponseHandler {
  return async (context, response) => {
    const rateLimitResponse = await rateLimitLogin(context, rateLimiter, null);
    return rateLimitResponse ?? response;
  };
}

export function createKnowledgeBaseRejectionRateLimitHandler(
  rateLimiter: ApiRateLimiter,
): RejectedResponseHandler {
  return (context, response) =>
    respondAfterUnresolvedKnowledgeBaseRateLimit(
      context,
      rateLimiter,
      response,
    );
}

export function createUserManagementRejectionRateLimitHandler(
  rateLimiter: ApiRateLimiter,
): RejectedResponseHandler {
  return (context, response) =>
    respondAfterUnresolvedUserManagementRateLimit(
      context,
      rateLimiter,
      response,
    );
}

export function createDocumentUploadRejectionRateLimitHandler(
  rateLimiter: ApiRateLimiter,
  limit: number,
): RejectedResponseHandler {
  return (context, response) =>
    respondAfterUnresolvedDocumentUploadRateLimit(
      context,
      rateLimiter,
      limit,
      response,
    );
}
