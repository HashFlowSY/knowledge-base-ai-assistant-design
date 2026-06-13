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
import type { KnowledgeBaseParams, UpdateKnowledgeBaseInput } from "../types";

type UpdateKnowledgeBaseContext = Context<
  ApiEnv,
  "/api/knowledge-bases/:knowledgeBaseId"
>;

export async function updateKnowledgeBaseProcedure(
  context: UpdateKnowledgeBaseContext,
  dependencies: KnowledgeBaseRouteDependencies,
): Promise<Response> {
  const params = getValidatedInput<KnowledgeBaseParams>(
    context,
    "knowledgeBaseParams",
  );
  const result = await dependencies.knowledgeBaseService.updateKnowledgeBase({
    actor: getRequiredKnowledgeActor(context),
    body: getValidatedInput<UpdateKnowledgeBaseInput>(
      context,
      "updateKnowledgeBaseBody",
    ),
    knowledgeBaseId: params.knowledgeBaseId,
  });
  if (!result.ok) {
    return respondWithServiceError(context, result);
  }

  return context.json(
    createSuccessResponse({
      data: result.knowledgeBase,
      httpStatus: 200,
      requestId: context.get("requestId"),
    }),
    200,
  );
}
