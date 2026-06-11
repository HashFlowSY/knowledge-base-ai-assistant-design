import type { Context, MiddlewareHandler } from "hono";

import type { SessionPayload } from "@kb/auth";
import type { KnowledgeActor } from "@kb/knowledge";

import type {
  ApiEnv,
  ApiRateLimiter,
  AuditService,
  AuthService,
} from "../contracts";
import {
  requireAdminKnowledgeBaseSession,
  requireAdminUserManagementSession,
  requireKnowledgeBaseSession,
  toKnowledgeActor,
} from "../guards";

export function createKnowledgeBaseSessionMiddleware(input: {
  authService: AuthService;
  rateLimiter: ApiRateLimiter;
}): MiddlewareHandler<ApiEnv> {
  return async (context, next) => {
    const result = await requireKnowledgeBaseSession(
      context,
      input.authService,
      input.rateLimiter,
    );
    if (!result.ok) {
      return result.response;
    }

    setAuthenticatedContext(context, result.actor);
    return next();
  };
}

export function createAdminKnowledgeBaseSessionMiddleware(input: {
  auditService: AuditService;
  authService: AuthService;
  rateLimiter: ApiRateLimiter;
}): MiddlewareHandler<ApiEnv> {
  return async (context, next) => {
    const result = await requireAdminKnowledgeBaseSession(
      context,
      input.auditService,
      input.authService,
      input.rateLimiter,
    );
    if (!result.ok) {
      return result.response;
    }

    setAuthenticatedContext(context, result.actor);
    return next();
  };
}

export function createAdminUserManagementSessionMiddleware(input: {
  auditService: AuditService;
  authService: AuthService;
  rateLimiter: ApiRateLimiter;
}): MiddlewareHandler<ApiEnv> {
  return async (context, next) => {
    const result = await requireAdminUserManagementSession(
      context,
      input.auditService,
      input.authService,
      input.rateLimiter,
    );
    if (!result.ok) {
      return result.response;
    }

    setAuthenticatedContext(context, result.actor);
    return next();
  };
}

export function getRequiredActor(context: Context<ApiEnv>): SessionPayload {
  const actor = context.get("actor");
  if (actor === null) {
    throw new Error("Missing authenticated actor context");
  }

  return actor;
}

export function getRequiredKnowledgeActor(
  context: Context<ApiEnv>,
): KnowledgeActor {
  return toKnowledgeActor(getRequiredActor(context));
}

export function setAuthenticatedContext(
  context: Context<ApiEnv>,
  actor: SessionPayload,
): void {
  context.set("actor", actor);
  context.set("session", actor);
  context.set("tenantId", actor.tenant.id);
  context.set(
    "logger",
    context.get("logger").child({
      actorId: actor.user.id,
      tenantId: actor.tenant.id,
    }),
  );
}
