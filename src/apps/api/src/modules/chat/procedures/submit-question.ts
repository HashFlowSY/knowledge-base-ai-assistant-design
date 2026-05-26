import type { Context } from "hono";

import type { ApiEnv } from "../../../contracts";
import { respondWithValidationError } from "../../../http";
import type { ChatRouteDependencies } from "../dependencies";
import { submitChatQuestionInputSchema } from "../types";
import { requireChatActor, respondChatServiceResult } from "./helpers";

export async function submitChatQuestionProcedure(
  context: Context<ApiEnv>,
  dependencies: ChatRouteDependencies,
): Promise<Response> {
  const authResult = await requireChatActor(context, dependencies);
  if (!authResult.ok) {
    return authResult.response;
  }

  const parsed = submitChatQuestionInputSchema.safeParse(await context.req.json());
  if (!parsed.success) {
    return respondWithValidationError(context, parsed.error);
  }

  const result = await dependencies.chatService.submitQuestion({
    actor: authResult.actor,
    body: parsed.data,
    requestId: context.get("requestId"),
  });

  return respondChatServiceResult(context, result);
}
