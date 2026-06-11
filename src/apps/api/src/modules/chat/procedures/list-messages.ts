import type { Context } from "hono";

import type { ApiEnv } from "../../../contracts";
import { respondWithError } from "../../../http";
import { getRequiredActor } from "../../../middleware";
import type { ChatRouteDependencies } from "../dependencies";
import { respondChatServiceResult } from "./helpers";

export async function listChatMessagesProcedure(
  context: Context<ApiEnv>,
  dependencies: ChatRouteDependencies,
): Promise<Response> {
  const sessionId = context.req.param("sessionId");
  if (sessionId === undefined) {
    return respondWithError(context, {
      code: "VALIDATION_ERROR",
      httpStatus: 400,
      message: "请检查填写内容。",
    });
  }

  const result = await dependencies.chatService.listMessages({
    actor: getRequiredActor(context),
    sessionId,
  });

  return respondChatServiceResult(context, result);
}
