import type { Context } from "hono";

import type { SessionPayload } from "@kb/auth";
import { createLogger } from "@kb/observability";

import type { ApiEnv, AuditService } from "../../contracts";
import { respondWithError } from "../../http";
import { getRequestIpSummary } from "./request";

export async function respondWithForbiddenAdminAttempt(
  context: Context<ApiEnv>,
  auditService: AuditService,
  actor: SessionPayload,
): Promise<Response> {
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
      error: error instanceof Error ? error.message : String(error),
      requestId: context.get("requestId"),
    });
    return respondWithError(context, {
      code: "INTERNAL_ERROR",
      httpStatus: 500,
      message: "操作失败，请稍后重试。",
    });
  }

  return respondWithError(context, {
    code: "FORBIDDEN",
    httpStatus: 403,
    message: "你没有权限执行此操作。",
  });
}
