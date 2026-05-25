import type { Context } from "hono";

import type { ApiEnv } from "../../../contracts";
import { createSuccessResponse, respondWithServiceError } from "../../../http";
import { requireKnowledgeBaseSession, toKnowledgeActor } from "../../../guards";
import type { KnowledgeBaseRouteDependencies } from "../dependencies";

type GetKnowledgeBaseContext = Context<
  ApiEnv,
  "/api/knowledge-bases/:knowledgeBaseId"
>;

export async function getKnowledgeBaseProcedure(
  context: GetKnowledgeBaseContext,
  dependencies: KnowledgeBaseRouteDependencies,
): Promise<Response> {
  const authResult = await requireKnowledgeBaseSession(
    context,
    dependencies.authService,
    dependencies.rateLimiter,
  );
  if (!authResult.ok) {
    return authResult.response;
  }

  const result = await dependencies.knowledgeBaseService.getKnowledgeBase({
    actor: toKnowledgeActor(authResult.actor),
    knowledgeBaseId: context.req.param("knowledgeBaseId"),
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
