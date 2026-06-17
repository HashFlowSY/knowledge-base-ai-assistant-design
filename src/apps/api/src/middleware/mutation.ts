import type { Context, MiddlewareHandler } from "hono";

import {
  forbidden,
  unsupportedMediaType,
  validationError,
  type AppError,
} from "@kb/errors";

import type { ApiEnv } from "../contracts";
import { hasRequestBody } from "../http";

type RejectionHandler = (
  context: Context<ApiEnv>,
  error: AppError,
) => Promise<void> | void;

interface MutationGuardOptions {
  allowedOrigins: string[];
  onRejected?: RejectionHandler;
}

export function createMutationGuardMiddleware(
  options: MutationGuardOptions,
): MiddlewareHandler<ApiEnv> {
  return async (context, next) => {
    const error = validateMutationRequest(context, options.allowedOrigins);
    if (error !== null) {
      return handleRejection(context, error, options.onRejected);
    }

    return next();
  };
}

export function createJsonMutationGuardMiddleware(
  options: MutationGuardOptions,
): MiddlewareHandler<ApiEnv> {
  return async (context, next) => {
    const error =
      validateMutationRequest(context, options.allowedOrigins) ??
      validateJsonContentType(context);
    if (error !== null) {
      return handleRejection(context, error, options.onRejected);
    }

    return next();
  };
}

export function createMultipartFormDataGuardMiddleware(options: {
  onRejected?: RejectionHandler;
} = {}): MiddlewareHandler<ApiEnv> {
  return async (context, next) => {
    const contentType = context.req.header("content-type");
    if (
      contentType === undefined ||
      !contentType.toLowerCase().includes("multipart/form-data")
    ) {
      return handleRejection(
        context,
        unsupportedMediaType({
          domain: "api",
          reason: "invalid_content_type",
          message: "请使用 multipart/form-data 请求体。",
        }),
        options.onRejected,
      );
    }

    return next();
  };
}

export function createNoBodyGuardMiddleware(options: {
  onRejected?: RejectionHandler;
} = {}): MiddlewareHandler<ApiEnv> {
  return async (context, next) => {
    if (hasRequestBody(context.req.raw)) {
      return handleRejection(
        context,
        validationError({
          domain: "api",
          reason: "unexpected_request_body",
          message: "请检查填写内容。",
        }),
        options.onRejected,
      );
    }

    return next();
  };
}

function validateMutationRequest(
  context: Context<ApiEnv>,
  allowedOrigins: string[],
): AppError | null {
  const origin = context.req.header("origin");
  if (origin === undefined || !allowedOrigins.includes(origin)) {
    return forbidden({
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
    return forbidden({
      domain: "api",
      reason: "bad_fetch_site",
    });
  }

  return null;
}

function validateJsonContentType(context: Context<ApiEnv>): AppError | null {
  const contentType = context.req.header("content-type");
  if (
    contentType === undefined ||
    !contentType.toLowerCase().includes("application/json")
  ) {
    return unsupportedMediaType({
      domain: "api",
      reason: "invalid_content_type",
      message: "请使用 application/json 请求体。",
    });
  }

  return null;
}

function handleRejection(
  context: Context<ApiEnv>,
  error: AppError,
  onRejected: RejectionHandler | undefined,
): Promise<Response> | Response {
  if (onRejected === undefined) {
    throw error;
  }

  return applyRejectionHandler(context, error, onRejected);
}

async function applyRejectionHandler(
  context: Context<ApiEnv>,
  error: AppError,
  onRejected: RejectionHandler,
): Promise<Response> {
  await onRejected(context, error);

  throw error;
}
