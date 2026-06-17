import type { Context } from "hono";

import type { ApiEnv, ApiRateLimiter, AuthService } from "../../contracts";
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
  let sessionResult: Awaited<ReturnType<AuthService["getSession"]>>;
  try {
    sessionResult = await authService.getSession({
      cookieHeader: context.req.header("cookie") ?? null,
    });
  } catch (error) {
    await rateLimitUnresolvedKnowledgeBase(
      context,
      rateLimiter,
    );
    throw error;
  }

  await rateLimitKnowledgeBase(
    context,
    rateLimiter,
    sessionResult.payload,
  );

  return {
    actor: sessionResult.payload,
  };
}
