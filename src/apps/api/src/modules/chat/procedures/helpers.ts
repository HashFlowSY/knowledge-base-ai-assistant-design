import type { Context } from "hono";
import type { z } from "zod";

import type { ApiEnv, ApiServiceError } from "../../../contracts";
import {
  createSuccessResponse,
  respondWithServiceError,
  respondWithValidationError,
} from "../../../http";
import { requireKnowledgeBaseSession } from "../../../guards";
import type { ChatRouteDependencies } from "../dependencies";

export async function requireChatActor(
  context: Context<ApiEnv>,
  dependencies: ChatRouteDependencies,
) {
  return requireKnowledgeBaseSession(
    context,
    dependencies.authService,
    dependencies.rateLimiter,
  );
}

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
  result: { ok: true; result: T } | ApiServiceError,
): Response {
  if (!result.ok) {
    return respondWithServiceError(context, result);
  }

  return respondChatSuccess(context, result.result);
}

export function respondChatValidationError(
  context: Context<ApiEnv>,
  error: z.ZodError,
): Response {
  return respondWithValidationError(context, error);
}
