import type { Context } from "hono";

import type { ApiEnv } from "../../../contracts";
import { createSuccessResponse, respondWithServiceError } from "../../../http";
import {
  getRequiredKnowledgeActor,
  getValidatedInput,
} from "../../../middleware";
import type { KnowledgeBaseRouteDependencies } from "../dependencies";
import type { KnowledgeBaseListQuery } from "../types";

export async function listKnowledgeBasesProcedure(
  context: Context<ApiEnv>,
  dependencies: KnowledgeBaseRouteDependencies,
): Promise<Response> {
  const result = await dependencies.knowledgeBaseService.listKnowledgeBases({
    actor: getRequiredKnowledgeActor(context),
    query: getValidatedInput<KnowledgeBaseListQuery>(
      context,
      "knowledgeBaseListQuery",
    ),
  });
  if (!result.ok) {
    return respondWithServiceError(context, result);
  }

  return context.json(
    createSuccessResponse({
      data: result.page,
      httpStatus: 200,
      requestId: context.get("requestId"),
    }),
    200,
  );
}
