import type { Context } from "hono";
import type { z } from "zod";

import type { ApiEnv, ApiServiceError } from "./contracts";
import { respondWithError } from "./http";

export function appendSetCookieHeaders(
  context: Context<ApiEnv>,
  setCookieHeaders: string[] | undefined,
): void {
  for (const setCookie of setCookieHeaders ?? []) {
    context.header("Set-Cookie", setCookie, { append: true });
  }
}

export function respondWithServiceError(
  context: Context<ApiEnv>,
  error: ApiServiceError,
): Response {
  return respondWithError(context, {
    code: error.code,
    httpStatus: error.httpStatus,
    message: error.message,
  });
}

export function respondWithValidationError(
  context: Context<ApiEnv>,
  error: z.ZodError,
): Response {
  return respondWithError(context, {
    code: "VALIDATION_ERROR",
    httpStatus: 400,
    message: "请检查填写内容。",
    validationErrors: error.issues.map((issue) => ({
      path: issue.path,
      message: issue.message,
    })),
  });
}

export function validateMutationRequest(
  context: Context<ApiEnv>,
  allowedOrigins: string[],
): Response | null {
  const origin = context.req.header("origin");
  if (origin === undefined || !allowedOrigins.includes(origin)) {
    return respondWithError(context, {
      code: "FORBIDDEN",
      httpStatus: 403,
      message: "你没有权限执行此操作。",
    });
  }

  const secFetchSite = context.req.header("sec-fetch-site");
  if (
    secFetchSite !== undefined &&
    secFetchSite !== "same-origin" &&
    secFetchSite !== "same-site"
  ) {
    return respondWithError(context, {
      code: "FORBIDDEN",
      httpStatus: 403,
      message: "你没有权限执行此操作。",
    });
  }

  return null;
}

export function validateJsonMutationRequest(
  context: Context<ApiEnv>,
  allowedOrigins: string[],
): Response | null {
  const mutationResponse = validateMutationRequest(context, allowedOrigins);
  if (mutationResponse !== null) {
    return mutationResponse;
  }

  const contentType = context.req.header("content-type");
  if (contentType === undefined || !contentType.toLowerCase().includes("application/json")) {
    return respondWithError(context, {
      code: "UNSUPPORTED_MEDIA_TYPE",
      httpStatus: 415,
      message: "请使用 application/json 请求体。",
    });
  }

  return null;
}
