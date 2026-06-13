import type { Context } from "hono";

import type { ApiEnv } from "../../../contracts";
import { getRequiredActor, getValidatedInput } from "../../../middleware";
import type { ChatRouteDependencies } from "../dependencies";
import type { ListChatSessionsQuery } from "../types";
import { respondChatServiceResult } from "./helpers";

export async function listChatSessionsProcedure(
  context: Context<ApiEnv>,
  dependencies: ChatRouteDependencies,
): Promise<Response> {
  const query = getValidatedInput<ListChatSessionsQuery>(
    context,
    "listChatSessionsQuery",
  );
  const result = await dependencies.chatService.listSessions({
    actor: getRequiredActor(context),
    query:
      query.knowledgeBaseId === undefined
        ? {}
        : { knowledgeBaseId: query.knowledgeBaseId },
  });

  return respondChatServiceResult(context, result);
}
