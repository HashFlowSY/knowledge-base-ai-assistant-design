import type { Context } from "hono";

import type { ApiEnv, ApiRateLimiter, AuthService } from "../../contracts";
import { appendSetCookieHeaders, respondWithError } from "../../http";
import {
  rateLimitKnowledgeBase,
  rateLimitUnresolvedKnowledgeBase,
} from "./rate-limits";
import type { SessionGuardResult } from "./types";

export async function requireKnowledgeBaseSession(
  context: Context<ApiEnv>,
  authService: AuthService,
  rateLimiter: ApiRateLimiter,
): SessionGuardResult {
  const sessionResult = await authService.getSession({
    cookieHeader: context.req.header("cookie") ?? null,
  });
  if (!sessionResult.ok) {
    appendSetCookieHeaders(context, sessionResult.setCookieHeaders);
    const rateLimitResponse = await rateLimitUnresolvedKnowledgeBase(
      context,
      rateLimiter,
    );
    if (rateLimitResponse !== null) {
      return {
        ok: false,
        response: rateLimitResponse,
      };
    }

    return {
      ok: false,
      response: respondWithError(context, {
        code: sessionResult.code,
        httpStatus: sessionResult.httpStatus,
        message: sessionResult.message,
      }),
    };
  }

  const rateLimitResponse = await rateLimitKnowledgeBase(
    context,
    rateLimiter,
    sessionResult.payload,
  );
  if (rateLimitResponse !== null) {
    return {
      ok: false,
      response: rateLimitResponse,
    };
  }

  return {
    actor: sessionResult.payload,
    ok: true,
  };
}
