import {
  conflict,
  forbidden,
  internalError,
  notFound,
  type AppError,
} from "@kb/errors";

export function createConflictError(message = "该邮箱已存在。"): AppError {
  return conflict({
    domain: "users",
    reason: "duplicate_email",
    message,
  });
}

export function createSelfProtectionError(): AppError {
  return forbidden({
    domain: "users",
    reason: "self_access_change",
    message: "不能对当前登录管理员执行此操作。",
  });
}

export function createInternalError(error?: unknown): AppError {
  return internalError(
    {
      domain: "users",
      reason: "unexpected_error",
      message: "操作失败，请稍后重试。",
    },
    { cause: error },
  );
}

export function createNotFoundError(): AppError {
  return notFound({
    domain: "users",
    reason: "user_not_found",
    message: "用户不存在或已被移除。",
  });
}
