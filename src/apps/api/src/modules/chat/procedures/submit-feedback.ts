import type { Context } from "hono";

import type { ApiEnv } from "../../../contracts";
import { respondWithError } from "../../../http";
import { getRequiredActor, getValidatedInput } from "../../../middleware";
import type { ChatRouteDependencies } from "../dependencies";
import type { SubmitAnswerFeedbackInput } from "../types";
import { respondChatServiceResult } from "./helpers";

export async function submitAnswerFeedbackProcedure(
  context: Context<ApiEnv>,
  dependencies: ChatRouteDependencies,
): Promise<Response> {
  const messageId = context.req.param("messageId");
  if (messageId === undefined) {
    return respondWithError(context, {
      code: "VALIDATION_ERROR",
      httpStatus: 400,
      message: "请检查填写内容。",
    });
  }

  const result = await dependencies.chatService.submitFeedback({
    actor: getRequiredActor(context),
    body: getValidatedInput<SubmitAnswerFeedbackInput>(
      context,
      "submitAnswerFeedbackBody",
    ),
    messageId,
  });

  return respondChatServiceResult(context, result);
}
