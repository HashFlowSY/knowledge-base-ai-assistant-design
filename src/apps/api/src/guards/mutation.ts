import type { Context } from "hono";

import { forbidden, unsupportedMediaType } from "@kb/errors";

import type { ApiEnv } from "../contracts";

export function validateMutationRequest(
  context: Context<ApiEnv>,
  allowedOrigins: string[],
): void {
  const origin = context.req.header("origin");
  if (origin === undefined || !allowedOrigins.includes(origin)) {
    throw forbidden({
      domain: "api",
      reason: "bad_origin",
    });
  }

  const secFetchSite = context.req.header("sec-fetch-site");
  if (
    secFetchSite !== undefined &&
    secFetchSite !== "same-origin" &&
    secFetchSite !== "same-site"
  ) {
    throw forbidden({
      domain: "api",
      reason: "bad_fetch_site",
    });
  }
}

export function validateJsonMutationRequest(
  context: Context<ApiEnv>,
  allowedOrigins: string[],
): void {
  validateMutationRequest(context, allowedOrigins);

  const contentType = context.req.header("content-type");
  if (
    contentType === undefined ||
    !contentType.toLowerCase().includes("application/json")
  ) {
    throw unsupportedMediaType({
      domain: "api",
      reason: "invalid_content_type",
      message: "请使用 application/json 请求体。",
    });
  }
}
