import type { Context } from "hono";
import type { z } from "zod";

import { validationError } from "@kb/errors";

import type { ApiEnv } from "../../../contracts";
import { createSuccessResponse } from "../../../http";

export function respondChatSuccess<T>(
  context: Context<ApiEnv>,
  data: T,
  status: 200 | 201 = 200,
): Response {
  return context.json(
    createSuccessResponse({
      data,
      httpStatus: status,
      requestId: context.get("requestId"),
    }),
    status,
  );
}

export function respondChatServiceResult<T>(
  context: Context<ApiEnv>,
  result: { ok: true; result: T },
): Response {
  return respondChatSuccess(context, result.result);
}

export function respondChatValidationError(
  context: Context<ApiEnv>,
  error: z.ZodError,
): Response {
  throw validationError({
    domain: "rag",
    reason: "invalid_chat_request",
    message: "请检查填写内容。",
    validationErrors: error.issues.map((issue) => ({
      path: issue.path,
      message: issue.message,
    })),
  });
}
