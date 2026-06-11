import type { Context, MiddlewareHandler } from "hono";

import type { ApiEnv } from "../contracts";
import { hasRequestBody, respondWithError } from "../http";

type RejectionHandler = (
  context: Context<ApiEnv>,
  response: Response,
) => Promise<Response> | Response;

interface MutationGuardOptions {
  allowedOrigins: string[];
  onRejected?: RejectionHandler;
}

export function createMutationGuardMiddleware(
  options: MutationGuardOptions,
): MiddlewareHandler<ApiEnv> {
  return async (context, next) => {
    const response = validateMutationRequest(context, options.allowedOrigins);
    if (response !== null) {
      return handleRejection(context, response, options.onRejected);
    }

    return next();
  };
}

export function createJsonMutationGuardMiddleware(
  options: MutationGuardOptions,
): MiddlewareHandler<ApiEnv> {
  return async (context, next) => {
    const response =
      validateMutationRequest(context, options.allowedOrigins) ??
      validateJsonContentType(context);
    if (response !== null) {
      return handleRejection(context, response, options.onRejected);
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
        respondWithError(context, {
          code: "UNSUPPORTED_MEDIA_TYPE",
          httpStatus: 415,
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
        respondWithError(context, {
          code: "VALIDATION_ERROR",
          httpStatus: 400,
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

function validateJsonContentType(context: Context<ApiEnv>): Response | null {
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

function handleRejection(
  context: Context<ApiEnv>,
  response: Response,
  onRejected: RejectionHandler | undefined,
): Promise<Response> | Response {
  if (onRejected === undefined) {
    return response;
  }

  return onRejected(context, response);
}
