import type { Context } from "hono";

import type { ApiEnv } from "../../../contracts";
import { respondWithValidationError } from "../../../http";
import type { ChatRouteDependencies } from "../dependencies";
import { createChatSessionInputSchema } from "../types";
import {
  requireChatActor,
  respondChatServiceResult,
} from "./helpers";

export async function createChatSessionProcedure(
  context: Context<ApiEnv>,
  dependencies: ChatRouteDependencies,
): Promise<Response> {
  const authResult = await requireChatActor(context, dependencies);
  if (!authResult.ok) {
    return authResult.response;
  }

  const parsed = createChatSessionInputSchema.safeParse(await context.req.json());
  if (!parsed.success) {
    return respondWithValidationError(context, parsed.error);
  }

  const result = await dependencies.chatService.createSession({
    actor: authResult.actor,
    body: parsed.data,
  });

  return respondChatServiceResult(context, result);
}
