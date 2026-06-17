import {
  forbidden,
  internalError,
  unauthorized,
  type AppError,
} from "@kb/errors";

export function createForbiddenAccessError(input: {
  setCookieHeaders?: string[];
} = {}): AppError {
  const responseHeaders =
    input.setCookieHeaders === undefined || input.setCookieHeaders.length === 0
      ? {}
      : { responseHeaders: { setCookie: input.setCookieHeaders } };

  return forbidden({
    domain: "auth",
    reason: "access_removed",
    message: "当前账号无权访问默认租户，请联系管理员。",
    ...responseHeaders,
  });
}

export function createInternalError(
  reason: "default_tenant_unavailable" | "unexpected_error" = "unexpected_error",
): AppError {
  return internalError({
    domain: "auth",
    reason,
    message: "操作失败，请稍后重试。",
  });
}

export function createInvalidCredentialsError(): AppError {
  return unauthorized({
    domain: "auth",
    reason: "invalid_credentials",
    message: "邮箱或密码不正确。",
  });
}

export function createMissingSessionError(): AppError {
  return unauthorized({
    domain: "auth",
    reason: "missing_session",
    message: "请先登录。",
  });
}

export function createExpiredSessionError(): AppError {
  return unauthorized({
    domain: "auth",
    reason: "session_expired",
    message: "登录已过期，请重新登录。",
  });
}

export function isBetterAuthUnauthorized(error: unknown): boolean {
  if (error === null || typeof error !== "object") {
    return false;
  }

  const candidate = error as { status?: unknown; statusCode?: unknown };

  return candidate.status === "UNAUTHORIZED" || candidate.statusCode === 401;
}
