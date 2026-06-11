import type { Context } from "hono";

import type { SessionPayload } from "@kb/auth";

import type { ApiEnv, ApiRateLimiter } from "../../contracts";
import { respondWithError } from "../../http";
import {
  createRateLimitIdentity,
  createSessionRateLimitIdentity,
  type RateLimitConsumeInput,
} from "../../rate-limit";
import { getRequestIpSummary } from "./request";

export async function respondAfterUnresolvedUserManagementRateLimit(
  context: Context<ApiEnv>,
  rateLimiter: ApiRateLimiter,
  fallbackResponse: Response,
): Promise<Response> {
  const rateLimitResponse = await rateLimitUnresolvedUserManagement(
    context,
    rateLimiter,
  );
  return rateLimitResponse ?? fallbackResponse;
}

export async function respondAfterUnresolvedKnowledgeBaseRateLimit(
  context: Context<ApiEnv>,
  rateLimiter: ApiRateLimiter,
  fallbackResponse: Response,
): Promise<Response> {
  const rateLimitResponse = await rateLimitUnresolvedKnowledgeBase(
    context,
    rateLimiter,
  );
  return rateLimitResponse ?? fallbackResponse;
}

export async function respondAfterUnresolvedDocumentUploadRateLimit(
  context: Context<ApiEnv>,
  rateLimiter: ApiRateLimiter,
  limit: number,
  fallbackResponse: Response,
): Promise<Response> {
  const rateLimitResponse = await rateLimitUnresolvedDocumentUpload(
    context,
    rateLimiter,
    limit,
  );
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
    ipSummary: getRequestIpSummary(context),
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
    ipSummary: getRequestIpSummary(context),
  });

  return consumeRateLimit(context, rateLimiter, {
    identity,
    limit: 120,
    scope: "auth",
    windowLabel: "1m",
    windowMs: 60_000,
  });
}

export async function rateLimitDocumentUpload(
  context: Context<ApiEnv>,
  rateLimiter: ApiRateLimiter,
  actor: SessionPayload,
  limit: number,
): Promise<Response | null> {
  const identity = await createRateLimitIdentity({
    kind: "actor",
    actorId: actor.user.id,
    tenantId: actor.tenant.id,
  });

  return consumeRateLimit(context, rateLimiter, {
    identity,
    limit,
    scope: "document-upload",
    windowLabel: "1m",
    windowMs: 60_000,
  });
}

export async function rateLimitUserManagement(
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

export async function rateLimitKnowledgeBase(
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
    scope: "knowledge-base",
    windowLabel: "1m",
    windowMs: 60_000,
  });
}

export async function rateLimitUnresolvedDocumentUpload(
  context: Context<ApiEnv>,
  rateLimiter: ApiRateLimiter,
  limit: number,
): Promise<Response | null> {
  const identity = await createRateLimitIdentity({
    kind: "ip",
    ipSummary: getRequestIpSummary(context),
  });

  return consumeRateLimit(context, rateLimiter, {
    identity,
    limit,
    scope: "document-upload",
    windowLabel: "1m",
    windowMs: 60_000,
  });
}

export async function rateLimitUnresolvedUserManagement(
  context: Context<ApiEnv>,
  rateLimiter: ApiRateLimiter,
): Promise<Response | null> {
  const identity = await createRateLimitIdentity({
    kind: "ip",
    ipSummary: getRequestIpSummary(context),
  });

  return consumeRateLimit(context, rateLimiter, {
    identity,
    limit: 60,
    scope: "user-management",
    windowLabel: "1m",
    windowMs: 60_000,
  });
}

export async function rateLimitUnresolvedKnowledgeBase(
  context: Context<ApiEnv>,
  rateLimiter: ApiRateLimiter,
): Promise<Response | null> {
  const identity = await createRateLimitIdentity({
    kind: "ip",
    ipSummary: getRequestIpSummary(context),
  });

  return consumeRateLimit(context, rateLimiter, {
    identity,
    limit: 60,
    scope: "knowledge-base",
    windowLabel: "1m",
    windowMs: 60_000,
  });
}

async function consumeRateLimit(
  context: Context<ApiEnv>,
  rateLimiter: ApiRateLimiter,
  input: RateLimitConsumeInput,
): Promise<Response | null> {
  if (context.get("rateLimitCounted")) {
    return null;
  }

  context.set("rateLimitCounted", true);
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
