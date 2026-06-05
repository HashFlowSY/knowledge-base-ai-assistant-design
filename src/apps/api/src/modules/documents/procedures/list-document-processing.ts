import type { Context } from "hono";

import type { ApiEnv } from "../../../contracts";
import {
  createSuccessResponse,
  respondWithError,
  respondWithServiceError,
} from "../../../http";
import {
  requireKnowledgeBaseSession,
  toKnowledgeActor,
} from "../../../guards";
import type { DocumentsRouteDependencies } from "../dependencies";
import { documentProcessingListQuerySchema } from "../types";

type ListDocumentProcessingContext = Context<
  ApiEnv,
  "/api/knowledge-bases/:knowledgeBaseId/documents/processing"
>;

export async function listDocumentProcessingProcedure(
  context: ListDocumentProcessingContext,
  dependencies: DocumentsRouteDependencies,
): Promise<Response> {
  const authResult = await requireKnowledgeBaseSession(
    context,
    dependencies.authService,
    dependencies.rateLimiter,
  );
  if (!authResult.ok) {
    return authResult.response;
  }

  const knowledgeBaseId = context.req.param("knowledgeBaseId");
  if (knowledgeBaseId.length === 0) {
    return respondWithError(context, {
      code: "VALIDATION_ERROR",
      httpStatus: 400,
      message: "知识库参数无效。",
    });
  }

  const query = documentProcessingListQuerySchema.parse(
    Object.fromEntries(new URL(context.req.url).searchParams),
  );
  const result = await dependencies.documentService.listDocumentProcessing({
    actor: toKnowledgeActor(authResult.actor),
    knowledgeBaseId,
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
