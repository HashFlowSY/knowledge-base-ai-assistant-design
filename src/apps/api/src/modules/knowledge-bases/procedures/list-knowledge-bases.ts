import type { Context } from "hono";

import { knowledgeBaseListQuerySchema } from "@kb/knowledge";

import type { ApiEnv } from "../../../contracts";
import { createSuccessResponse } from "../../../http";
import { respondWithServiceError } from "../../../request-helpers";
import { requireKnowledgeBaseSession } from "../../../session-guards";
import type { KnowledgeBaseRouteDependencies } from "../types";

export async function listKnowledgeBasesProcedure(
  context: Context<ApiEnv>,
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

  const query = knowledgeBaseListQuerySchema.parse(
    Object.fromEntries(new URL(context.req.url).searchParams),
  );
  const result = await dependencies.knowledgeBaseService.listKnowledgeBases({
    actor: authResult.actor,
    query,
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
