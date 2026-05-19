import type { Context } from "hono";

import type { SessionPayload } from "@kb/auth";
import { createLogger } from "@kb/observability";

import type {
  ApiEnv,
  ApiRateLimiter,
  AuditService,
  AuthService,
} from "./contracts";
import { respondWithError } from "./http";
import {
  createRateLimitIdentity,
  createSessionRateLimitIdentity,
  type RateLimitConsumeInput,
} from "./rate-limit";
import { appendSetCookieHeaders } from "./request-helpers";

export async function requireAdminUserManagementSession(
  context: Context<ApiEnv>,
  auditService: AuditService,
  authService: AuthService,
  rateLimiter: ApiRateLimiter,
): Promise<{ ok: true; actor: SessionPayload } | { ok: false; response: Response }> {
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
    try {
      await auditService.recordForbiddenAdminAttempt({
        action: "auth.forbidden",
        actor: sessionResult.payload,
        ipSummary: getIpSummary(context),
        method: context.req.method,
        path: context.req.path,
        requestId: context.get("requestId"),
        targetId: context.req.path,
        targetType: "api_route",
        userAgentSummary: context.req.header("user-agent") ?? null,
      });
    } catch (error) {
      createLogger({ service: "api" }).error("auth_forbidden_audit_failed", {
        error: error instanceof Error ? error.message : String(error),
        requestId: context.get("requestId"),
      });
      return {
        ok: false,
        response: respondWithError(context, {
          code: "INTERNAL_ERROR",
          httpStatus: 500,
          message: "操作失败，请稍后重试。",
        }),
      };
    }

    return {
      ok: false,
      response: respondWithError(context, {
        code: "FORBIDDEN",
        httpStatus: 403,
        message: "你没有权限执行此操作。",
      }),
    };
  }

  return {
    ok: true,
    actor: sessionResult.payload,
  };
}

export async function respondAfterUnresolvedUserManagementRateLimit(
  context: Context<ApiEnv>,
  rateLimiter: ApiRateLimiter,
  fallbackResponse: Response,
): Promise<Response> {
  const rateLimitResponse = await rateLimitUnresolvedUserManagement(context, rateLimiter);
  return rateLimitResponse ?? fallbackResponse;
}

export async function rateLimitLogin(
  context: Context<ApiEnv>,
  rateLimiter: ApiRateLimiter,
  email: string | null,
): Promise<Response | null> {
  const identity = await createRateLimitIdentity({
    kind: "login",
    email,
    ipSummary: getIpSummary(context),
  });

  return consumeRateLimit(context, rateLimiter, {
    identity,
    limit: 30,
    scope: "auth",
    windowLabel: "15m",
    windowMs: 15 * 60_000,
  });
}

export function getLoginRateLimitEmail(body: unknown): string | null {
  if (typeof body !== "object" || body === null || !("email" in body)) {
    return null;
  }

  const email = body.email;
  return typeof email === "string" ? email : null;
}

export async function rateLimitAuthSession(
  context: Context<ApiEnv>,
  rateLimiter: ApiRateLimiter,
): Promise<Response | null> {
  const identity = await createSessionRateLimitIdentity({
    cookieHeader: context.req.header("cookie") ?? null,
    ipSummary: getIpSummary(context),
  });

  return consumeRateLimit(context, rateLimiter, {
    identity,
    limit: 120,
    scope: "auth",
    windowLabel: "1m",
    windowMs: 60_000,
  });
}

async function rateLimitUserManagement(
  context: Context<ApiEnv>,
  rateLimiter: ApiRateLimiter,
  actor: SessionPayload,
): Promise<Response | null> {
  const identity = await createRateLimitIdentity({
    kind: "actor",
    actorId: actor.user.id,
    tenantId: actor.tenant.id,
  });

  return consumeRateLimit(context, rateLimiter, {
    identity,
    limit: 120,
    scope: "user-management",
    windowLabel: "1m",
    windowMs: 60_000,
  });
}

async function rateLimitUnresolvedUserManagement(
  context: Context<ApiEnv>,
  rateLimiter: ApiRateLimiter,
): Promise<Response | null> {
  const identity = await createRateLimitIdentity({
    kind: "ip",
    ipSummary: getIpSummary(context),
  });

  return consumeRateLimit(context, rateLimiter, {
    identity,
    limit: 60,
    scope: "user-management",
    windowLabel: "1m",
    windowMs: 60_000,
  });
}

async function consumeRateLimit(
  context: Context<ApiEnv>,
  rateLimiter: ApiRateLimiter,
  input: RateLimitConsumeInput,
): Promise<Response | null> {
  const result = await rateLimiter.consume(input);

  if (result.allowed) {
    return null;
  }

  context.header("Retry-After", result.retryAfterSeconds.toString());
  return respondWithError(context, {
    code: "RATE_LIMITED",
    httpStatus: 429,
    message: "请求过于频繁，请稍后重试。",
  });
}

function getIpSummary(context: Context<ApiEnv>): string {
  const forwardedFor = context.req.header("x-forwarded-for");
  const firstForwardedIp = forwardedFor?.split(",")[0]?.trim();

  return firstForwardedIp && firstForwardedIp.length > 0 ? firstForwardedIp : "127.0.0.1";
}
