import type { ProviderErrorCode } from "../index";
import {
  forbidden,
  internalError,
  providerUnavailable,
  rateLimited,
  validationError,
  type AppError,
} from "@kb/errors";

export function mapProviderConnectionError(
  code: ProviderErrorCode,
): AppError {
  if (code === "PROVIDER_AUTH_FAILED") {
    return forbidden({
      domain: "providers",
      reason: "provider_auth_failed",
      message: "模型服务认证失败，请检查 API Key。",
    });
  }

  if (code === "PROVIDER_RATE_LIMITED") {
    return rateLimited({
      domain: "providers",
      reason: "provider_rate_limited",
      message: "模型服务请求过于频繁，请稍后重试。",
    });
  }

  if (
    code === "PROVIDER_INVALID_REQUEST" ||
    code === "PROVIDER_UNSUPPORTED_MODEL" ||
    code === "PROVIDER_CONTENT_REJECTED"
  ) {
    return createValidationError("模型服务连接测试失败，请检查配置后重试。");
  }

  return providerUnavailable({
    domain: "providers",
    reason: "provider_unavailable",
    message: "模型服务暂时不可用，请稍后重试。",
  });
}

export function createValidationError(
  message: string,
  reason = "provider_config_invalid",
): AppError {
  return validationError({
    domain: "providers",
    reason,
    message,
  });
}

export function createInternalError(
  reason = "provider_secret_unavailable",
): AppError {
  return internalError({
    domain: "providers",
    reason,
    message: "操作失败，请稍后重试。",
  });
}

export function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "AbortError"
  );
}
