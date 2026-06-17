import type { ContentfulStatusCode } from "hono/utils/http-status";

import type {
  ApiErrorCode,
  ApiErrorResponse,
  ApiSuccessResponse,
} from "@kb/shared";

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
  code: ApiErrorCode;
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
