import type { Context } from "hono";

import type {
  ApiEnv,
  ApiRateLimiter,
  AuditService,
  AuthService,
} from "../../contracts";
import { respondWithForbiddenAdminAttempt } from "./audit";
import { requireKnowledgeBaseSession } from "./knowledge-session";
import {
  rateLimitUnresolvedUserManagement,
  rateLimitUserManagement,
} from "./rate-limits";
import type { SessionGuardResult } from "./types";

export async function requireAdminUserManagementSession(
  context: Context<ApiEnv>,
  auditService: AuditService,
  authService: AuthService,
  rateLimiter: ApiRateLimiter,
): SessionGuardResult {
  let sessionResult: Awaited<ReturnType<AuthService["getSession"]>>;
  try {
    sessionResult = await authService.getSession({
      cookieHeader: context.req.header("cookie") ?? null,
    });
  } catch (error) {
    await rateLimitUnresolvedUserManagement(
      context,
      rateLimiter,
    );
    throw error;
  }

  await rateLimitUserManagement(
    context,
    rateLimiter,
    sessionResult.payload,
  );

  if (sessionResult.payload.role !== "admin") {
    await respondWithForbiddenAdminAttempt(
      context,
      auditService,
      sessionResult.payload,
    );
  }

  return {
    actor: sessionResult.payload,
  };
}

export async function requireAdminKnowledgeBaseSession(
  context: Context<ApiEnv>,
  auditService: AuditService,
  authService: AuthService,
  rateLimiter: ApiRateLimiter,
): SessionGuardResult {
  const authResult = await requireKnowledgeBaseSession(
    context,
    authService,
    rateLimiter,
  );

  if (authResult.actor.role === "admin") {
    return authResult;
  }

  return await respondWithForbiddenAdminAttempt(
    context,
    auditService,
    authResult.actor,
  );
}
