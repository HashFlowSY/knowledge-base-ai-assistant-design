import type { Context } from "hono";

import type { SessionPayload } from "@kb/auth";
import { forbidden, internalError } from "@kb/errors";
import { createLogger, createSafeErrorLogFields } from "@kb/observability";

import type { ApiEnv, AuditService } from "../../contracts";
import { getRequestIpSummary } from "./request";

export async function respondWithForbiddenAdminAttempt(
  context: Context<ApiEnv>,
  auditService: AuditService,
  actor: SessionPayload,
): Promise<never> {
  try {
    await auditService.recordForbiddenAdminAttempt({
      action: "auth.forbidden",
      actor,
      ipSummary: getRequestIpSummary(context),
      method: context.req.method,
      path: context.req.path,
      requestId: context.get("requestId"),
      targetId: context.req.path,
      targetType: "api_route",
      userAgentSummary: context.req.header("user-agent") ?? null,
    });
  } catch (error) {
    createLogger({ service: "api" }).error("auth_forbidden_audit_failed", {
      ...createSafeErrorLogFields(error, {
        message: "Forbidden admin audit failed.",
      }),
      requestId: context.get("requestId"),
    });
    throw internalError({
      domain: "audit",
      reason: "forbidden_admin_audit_failed",
      message: "操作失败，请稍后重试。",
    });
  }

  throw forbidden({
    domain: "auth",
    reason: "admin_required",
    message: "你没有权限执行此操作。",
  });
}
