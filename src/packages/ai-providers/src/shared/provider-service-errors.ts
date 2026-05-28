import type { ProviderErrorCode } from "../index";
import type { ProviderConfigServiceError } from "./service-types";

export function mapProviderConnectionError(
  code: ProviderErrorCode,
): ProviderConfigServiceError {
  if (code === "PROVIDER_AUTH_FAILED") {
    return {
      ok: false,
      code: "FORBIDDEN",
      httpStatus: 403,
      message: "模型服务认证失败，请检查 API Key。",
    };
  }

  if (code === "PROVIDER_RATE_LIMITED") {
    return {
      ok: false,
      code: "RATE_LIMITED",
      httpStatus: 429,
      message: "模型服务请求过于频繁，请稍后重试。",
    };
  }

  if (
    code === "PROVIDER_INVALID_REQUEST" ||
    code === "PROVIDER_UNSUPPORTED_MODEL" ||
    code === "PROVIDER_CONTENT_REJECTED"
  ) {
    return createValidationError("模型服务连接测试失败，请检查配置后重试。");
  }

  return {
    ok: false,
    code: "PROVIDER_UNAVAILABLE",
    httpStatus: 500,
    message: "模型服务暂时不可用，请稍后重试。",
  };
}

export function createValidationError(message: string): ProviderConfigServiceError {
  return {
    ok: false,
    code: "VALIDATION_ERROR",
    httpStatus: 400,
    message,
  };
}

export function createInternalError(): ProviderConfigServiceError {
  return {
    ok: false,
    code: "INTERNAL_ERROR",
    httpStatus: 500,
    message: "操作失败，请稍后重试。",
  };
}

export function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "AbortError"
  );
}
