import {
  conflict,
  forbidden,
  internalError,
  notFound,
  validationError,
  type AppError,
} from "@kb/errors";

export function createConflictError(
  message = "当前租户下已存在同名知识库。",
): AppError {
  return conflict({
    domain: "knowledge",
    reason: "duplicate_knowledge_base_name",
    message,
  });
}

export function createForbiddenError(): AppError {
  return forbidden({
    domain: "knowledge",
    reason: "knowledge_base_forbidden",
    message: "你没有权限执行此操作。",
  });
}

export function createInternalError(error?: unknown): AppError {
  return internalError(
    {
      domain: "knowledge",
      reason: "unexpected_error",
      message: "操作失败，请稍后重试。",
    },
    { cause: error },
  );
}

export function createInvalidMembersError(): AppError {
  return validationError({
    domain: "knowledge",
    reason: "invalid_member_ids",
    message: "请选择当前租户下仍有效的 member 用户。",
  });
}

export function createNotFoundError(): AppError {
  return notFound({
    domain: "knowledge",
    reason: "knowledge_base_not_found",
    message: "知识库不存在或无权访问。",
  });
}
