import type { Context } from "hono";

import type { ApiEnv } from "../../../contracts";
import {
  createSuccessResponse,
  respondWithServiceError,
} from "../../../http";
import {
  getRequiredKnowledgeActor,
  getValidatedInput,
} from "../../../middleware";
import type { KnowledgeBaseRouteDependencies } from "../dependencies";
import type { CreateKnowledgeBaseInput } from "../types";

export async function createKnowledgeBaseProcedure(
  context: Context<ApiEnv>,
  dependencies: KnowledgeBaseRouteDependencies,
): Promise<Response> {
  const result = await dependencies.knowledgeBaseService.createKnowledgeBase({
    actor: getRequiredKnowledgeActor(context),
    body: getValidatedInput<CreateKnowledgeBaseInput>(
      context,
      "createKnowledgeBaseBody",
    ),
  });
  if (!result.ok) {
    return respondWithServiceError(context, result);
  }

  return context.json(
    createSuccessResponse({
      data: result.knowledgeBase,
      httpStatus: 201,
      requestId: context.get("requestId"),
    }),
    201,
  );
}
