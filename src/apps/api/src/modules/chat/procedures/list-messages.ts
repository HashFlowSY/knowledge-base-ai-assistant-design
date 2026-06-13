import type { Context } from "hono";

import type { ApiEnv } from "../../../contracts";
import { getRequiredActor, getValidatedInput } from "../../../middleware";
import type { ChatRouteDependencies } from "../dependencies";
import type { ChatSessionMessagesParams } from "../types";
import { respondChatServiceResult } from "./helpers";

export async function listChatMessagesProcedure(
  context: Context<ApiEnv>,
  dependencies: ChatRouteDependencies,
): Promise<Response> {
  const params = getValidatedInput<ChatSessionMessagesParams>(
    context,
    "chatSessionMessagesParams",
  );

  const result = await dependencies.chatService.listMessages({
    actor: getRequiredActor(context),
    sessionId: params.sessionId,
  });

  return respondChatServiceResult(context, result);
}
