import type { Context } from "hono";

import type { ApiEnv } from "../../../contracts";
import { getRequiredActor, getValidatedInput } from "../../../middleware";
import type { ChatRouteDependencies } from "../dependencies";
import type { SubmitChatQuestionInput } from "../types";
import { respondChatServiceResult } from "./helpers";

export async function submitChatQuestionProcedure(
  context: Context<ApiEnv>,
  dependencies: ChatRouteDependencies,
): Promise<Response> {
  const result = await dependencies.chatService.submitQuestion({
    actor: getRequiredActor(context),
    body: getValidatedInput<SubmitChatQuestionInput>(
      context,
      "submitChatQuestionBody",
    ),
    requestId: context.get("requestId"),
  });

  return respondChatServiceResult(context, result);
}
