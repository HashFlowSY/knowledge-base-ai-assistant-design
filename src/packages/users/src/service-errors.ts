export interface UserServiceError {
  ok: false;
  code: "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "VALIDATION_ERROR" | "INTERNAL_ERROR";
  httpStatus: 400 | 403 | 404 | 409 | 500;
  message: string;
}

export function createConflictError(message = "该邮箱已存在。"): UserServiceError {
  return {
    ok: false,
    code: "CONFLICT",
    httpStatus: 409,
    message,
  };
}

export function createSelfProtectionError(): UserServiceError {
  return {
    ok: false,
    code: "FORBIDDEN",
    httpStatus: 403,
    message: "不能对当前登录管理员执行此操作。",
  };
}

export function createInternalError(): UserServiceError {
  return {
    ok: false,
    code: "INTERNAL_ERROR",
    httpStatus: 500,
    message: "操作失败，请稍后重试。",
  };
}

export function createNotFoundError(): UserServiceError {
  return {
    ok: false,
    code: "NOT_FOUND",
    httpStatus: 404,
    message: "用户不存在或已被移除。",
  };
}

export function toServiceError(error: {
  code: "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "VALIDATION_ERROR" | "INTERNAL_ERROR";
  message: string;
}): UserServiceError {
  const httpStatusByCode = {
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    VALIDATION_ERROR: 400,
    INTERNAL_ERROR: 500,
  } as const;

  return {
    ok: false,
    code: error.code,
    httpStatus: httpStatusByCode[error.code],
    message: error.message,
  };
}

export function toServiceException(error: UserServiceError): Error {
  return Object.assign(new Error(error.message), { serviceError: error });
}

export function fromServiceException(error: unknown): UserServiceError {
  if (
    typeof error === "object" &&
    error !== null &&
    "serviceError" in error &&
    typeof error.serviceError === "object" &&
    error.serviceError !== null
  ) {
    return error.serviceError as UserServiceError;
  }

  return createInternalError();
}
