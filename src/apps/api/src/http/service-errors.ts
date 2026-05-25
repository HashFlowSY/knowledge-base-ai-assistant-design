import type { Context } from "hono";
import type { z } from "zod";

import type { ApiEnv, ApiServiceError } from "../contracts";
import { respondWithError } from "./responses";

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
