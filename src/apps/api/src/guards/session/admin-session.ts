import type { Context } from "hono";

import type {
  ApiEnv,
  ApiRateLimiter,
  AuditService,
  AuthService,
} from "../../contracts";
import { appendSetCookieHeaders, respondWithError } from "../../http";
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
  const sessionResult = await authService.getSession({
    cookieHeader: context.req.header("cookie") ?? null,
  });
  if (!sessionResult.ok) {
    appendSetCookieHeaders(context, sessionResult.setCookieHeaders);
    const rateLimitResponse = await rateLimitUnresolvedUserManagement(
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

  const rateLimitResponse = await rateLimitUserManagement(
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

  if (sessionResult.payload.role !== "admin") {
    return {
      ok: false,
      response: await respondWithForbiddenAdminAttempt(
        context,
        auditService,
        sessionResult.payload,
      ),
    };
  }

  return {
    ok: true,
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
  if (!authResult.ok) {
    return authResult;
  }

  if (authResult.actor.role === "admin") {
    return authResult;
  }

  return {
    ok: false,
    response: await respondWithForbiddenAdminAttempt(
      context,
      auditService,
      authResult.actor,
    ),
  };
}
