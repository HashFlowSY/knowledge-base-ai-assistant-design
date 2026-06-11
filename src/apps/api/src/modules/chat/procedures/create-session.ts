import type { Context } from "hono";

import type { ApiEnv } from "../../../contracts";
import { getRequiredActor, getValidatedInput } from "../../../middleware";
import type { ChatRouteDependencies } from "../dependencies";
import type { CreateChatSessionInput } from "../types";
import { respondChatServiceResult } from "./helpers";

export async function createChatSessionProcedure(
  context: Context<ApiEnv>,
  dependencies: ChatRouteDependencies,
): Promise<Response> {
  const result = await dependencies.chatService.createSession({
    actor: getRequiredActor(context),
    body: getValidatedInput<CreateChatSessionInput>(
      context,
      "createChatSessionBody",
    ),
  });

  return respondChatServiceResult(context, result);
}
