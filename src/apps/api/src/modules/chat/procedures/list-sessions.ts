import type { Context } from "hono";
import { z } from "zod";

import type { ApiEnv } from "../../../contracts";
import type { ChatRouteDependencies } from "../dependencies";
import { requireChatActor, respondChatServiceResult } from "./helpers";

const listChatSessionsQuerySchema = z.object({
  knowledgeBaseId: z.string().trim().min(1).optional(),
});

export async function listChatSessionsProcedure(
  context: Context<ApiEnv>,
  dependencies: ChatRouteDependencies,
): Promise<Response> {
  const authResult = await requireChatActor(context, dependencies);
  if (!authResult.ok) {
    return authResult.response;
  }

  const query = listChatSessionsQuerySchema.parse(
    Object.fromEntries(new URL(context.req.url).searchParams),
  );
  const result = await dependencies.chatService.listSessions({
    actor: authResult.actor,
    query:
      query.knowledgeBaseId === undefined
        ? {}
        : { knowledgeBaseId: query.knowledgeBaseId },
  });

  return respondChatServiceResult(context, result);
}
