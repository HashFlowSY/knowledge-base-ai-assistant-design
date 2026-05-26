import type { Context } from "hono";

import type { ApiEnv } from "../../../contracts";
import { respondWithError, respondWithValidationError } from "../../../http";
import type { ChatRouteDependencies } from "../dependencies";
import { submitAnswerFeedbackInputSchema } from "../types";
import { requireChatActor, respondChatServiceResult } from "./helpers";

export async function submitAnswerFeedbackProcedure(
  context: Context<ApiEnv>,
  dependencies: ChatRouteDependencies,
): Promise<Response> {
  const authResult = await requireChatActor(context, dependencies);
  if (!authResult.ok) {
    return authResult.response;
  }

  const parsed = submitAnswerFeedbackInputSchema.safeParse(await context.req.json());
  if (!parsed.success) {
    return respondWithValidationError(context, parsed.error);
  }

  const messageId = context.req.param("messageId");
  if (messageId === undefined) {
    return respondWithError(context, {
      code: "VALIDATION_ERROR",
      httpStatus: 400,
      message: "请检查填写内容。",
    });
  }

  const result = await dependencies.chatService.submitFeedback({
    actor: authResult.actor,
    body: parsed.data,
    messageId,
  });

  return respondChatServiceResult(context, result);
}
