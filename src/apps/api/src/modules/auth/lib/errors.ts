import type { ApiServiceError } from "../../../contracts";

export function createForbiddenAccessError(): ApiServiceError {
  return {
    ok: false,
    code: "FORBIDDEN",
    httpStatus: 403,
    message: "当前账号无权访问默认租户，请联系管理员。",
  };
}

export function createInternalError(): ApiServiceError {
  return {
    ok: false,
    code: "INTERNAL_ERROR",
    httpStatus: 500,
    message: "操作失败，请稍后重试。",
  };
}

export function isBetterAuthUnauthorized(error: unknown): boolean {
  if (error === null || typeof error !== "object") {
    return false;
  }

  const candidate = error as { status?: unknown; statusCode?: unknown };

  return candidate.status === "UNAUTHORIZED" || candidate.statusCode === 401;
}
