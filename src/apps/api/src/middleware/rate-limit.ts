import type { Context, MiddlewareHandler } from "hono";

import type { AppError } from "@kb/errors";

import type { ApiEnv, ApiRateLimiter } from "../contracts";
import {
  getLoginRateLimitEmail,
  rateLimitAuthSession,
  rateLimitUnresolvedDocumentUpload,
  rateLimitUnresolvedKnowledgeBase,
  rateLimitUnresolvedUserManagement,
  rateLimitLogin,
} from "../guards";
import { readJsonBodyOnce } from "./validation";

export type RejectedResponseHandler = (
  context: Context<ApiEnv>,
  error: AppError,
) => Promise<void> | void;

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
  return async (context) => {
    await rateLimitAuthSession(context, rateLimiter);
  };
}

export function createLoginRejectionRateLimitHandler(
  rateLimiter: ApiRateLimiter,
): RejectedResponseHandler {
  return async (context) => {
    await rateLimitLogin(context, rateLimiter, null);
  };
}

export function createKnowledgeBaseRejectionRateLimitHandler(
  rateLimiter: ApiRateLimiter,
): RejectedResponseHandler {
  return async (context) => {
    await rateLimitUnresolvedKnowledgeBase(context, rateLimiter);
  };
}

export function createUserManagementRejectionRateLimitHandler(
  rateLimiter: ApiRateLimiter,
): RejectedResponseHandler {
  return async (context) => {
    await rateLimitUnresolvedUserManagement(context, rateLimiter);
  };
}

export function createDocumentUploadRejectionRateLimitHandler(
  rateLimiter: ApiRateLimiter,
  limit: number,
): RejectedResponseHandler {
  return async (context) => {
    await rateLimitUnresolvedDocumentUpload(context, rateLimiter, limit);
  };
}
