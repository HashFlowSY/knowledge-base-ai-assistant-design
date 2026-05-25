import type { Context } from "hono";

import type { ApiEnv } from "../contracts";
import { respondWithError } from "../http";

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
  if (
    contentType === undefined ||
    !contentType.toLowerCase().includes("application/json")
  ) {
    return respondWithError(context, {
      code: "UNSUPPORTED_MEDIA_TYPE",
      httpStatus: 415,
      message: "请使用 application/json 请求体。",
    });
  }

  return null;
}
