import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { ApiErrorResponse, ApiSuccessResponse } from "@kb/shared";

import type { ApiEnv } from "./app";

export function createSuccessResponse<T>(input: {
  data: T;
  httpStatus: ContentfulStatusCode;
  requestId: string;
}): ApiSuccessResponse<T> {
  return {
    success: true,
    httpStatus: input.httpStatus,
    data: input.data,
    requestId: input.requestId,
  };
}

export function createErrorResponse(input: {
  code: string;
  httpStatus: ContentfulStatusCode;
  message: string;
  requestId: string;
  validationErrors?: { path: (string | number)[]; message: string }[];
}): ApiErrorResponse {
  return {
    success: false,
    httpStatus: input.httpStatus,
    code: input.code,
    message: input.message,
    requestId: input.requestId,
    ...(input.validationErrors === undefined
      ? {}
      : { validationErrors: input.validationErrors }),
  };
}

export function respondWithError(
  context: Context<ApiEnv>,
  input: {
    code: string;
    httpStatus: ContentfulStatusCode;
    message: string;
    validationErrors?: { path: (string | number)[]; message: string }[];
  },
): Response {
  return context.json(
    createErrorResponse({
      ...input,
      requestId: context.get("requestId"),
    }),
    input.httpStatus,
  );
}

export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export function hasRequestBody(request: Request): boolean {
  const contentType = request.headers.get("content-type");
  const contentLength = request.headers.get("content-length");

  return (
    (contentLength !== null && contentLength !== "0") ||
    (contentType !== null && contentType.toLowerCase().includes("application/json"))
  );
}
