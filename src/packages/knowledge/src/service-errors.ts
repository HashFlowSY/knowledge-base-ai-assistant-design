export interface KnowledgeBaseServiceError {
  ok: false;
  code: "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "VALIDATION_ERROR" | "INTERNAL_ERROR";
  httpStatus: 400 | 403 | 404 | 409 | 500;
  message: string;
}

export function createConflictError(
  message = "当前租户下已存在同名知识库。",
): KnowledgeBaseServiceError {
  return {
    ok: false,
    code: "CONFLICT",
    httpStatus: 409,
    message,
  };
}

export function createForbiddenError(): KnowledgeBaseServiceError {
  return {
    ok: false,
    code: "FORBIDDEN",
    httpStatus: 403,
    message: "你没有权限执行此操作。",
  };
}

export function createInternalError(): KnowledgeBaseServiceError {
  return {
    ok: false,
    code: "INTERNAL_ERROR",
    httpStatus: 500,
    message: "操作失败，请稍后重试。",
  };
}

export function createInvalidMembersError(): KnowledgeBaseServiceError {
  return {
    ok: false,
    code: "VALIDATION_ERROR",
    httpStatus: 400,
    message: "请选择当前租户下仍有效的 member 用户。",
  };
}

export function createNotFoundError(): KnowledgeBaseServiceError {
  return {
    ok: false,
    code: "NOT_FOUND",
    httpStatus: 404,
    message: "知识库不存在或无权访问。",
  };
}

export function toServiceException(error: KnowledgeBaseServiceError): Error {
  return Object.assign(new Error(error.message), { serviceError: error });
}

export function fromServiceException(error: unknown): KnowledgeBaseServiceError {
  if (
    typeof error === "object" &&
    error !== null &&
    "serviceError" in error &&
    typeof error.serviceError === "object" &&
    error.serviceError !== null
  ) {
    return error.serviceError as KnowledgeBaseServiceError;
  }

  return createInternalError();
}
