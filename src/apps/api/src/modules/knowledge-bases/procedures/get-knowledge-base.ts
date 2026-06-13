import type { Context } from "hono";

import type { ApiEnv } from "../../../contracts";
import { createSuccessResponse, respondWithServiceError } from "../../../http";
import {
  getRequiredKnowledgeActor,
  getValidatedInput,
} from "../../../middleware";
import type { KnowledgeBaseRouteDependencies } from "../dependencies";
import type { KnowledgeBaseParams } from "../types";

type GetKnowledgeBaseContext = Context<
  ApiEnv,
  "/api/knowledge-bases/:knowledgeBaseId"
>;

export async function getKnowledgeBaseProcedure(
  context: GetKnowledgeBaseContext,
  dependencies: KnowledgeBaseRouteDependencies,
): Promise<Response> {
  const params = getValidatedInput<KnowledgeBaseParams>(
    context,
    "knowledgeBaseParams",
  );
  const result = await dependencies.knowledgeBaseService.getKnowledgeBase({
    actor: getRequiredKnowledgeActor(context),
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
