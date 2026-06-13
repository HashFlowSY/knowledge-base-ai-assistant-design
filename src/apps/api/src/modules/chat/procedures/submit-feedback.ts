import type { Context } from "hono";

import type { ApiEnv } from "../../../contracts";
import { getRequiredActor, getValidatedInput } from "../../../middleware";
import type { ChatRouteDependencies } from "../dependencies";
import type {
  ChatMessageFeedbackParams,
  SubmitAnswerFeedbackInput,
} from "../types";
import { respondChatServiceResult } from "./helpers";

export async function submitAnswerFeedbackProcedure(
  context: Context<ApiEnv>,
  dependencies: ChatRouteDependencies,
): Promise<Response> {
  const params = getValidatedInput<ChatMessageFeedbackParams>(
    context,
    "chatMessageFeedbackParams",
  );

  const result = await dependencies.chatService.submitFeedback({
    actor: getRequiredActor(context),
    body: getValidatedInput<SubmitAnswerFeedbackInput>(
      context,
      "submitAnswerFeedbackBody",
    ),
    messageId: params.messageId,
  });

  return respondChatServiceResult(context, result);
}
