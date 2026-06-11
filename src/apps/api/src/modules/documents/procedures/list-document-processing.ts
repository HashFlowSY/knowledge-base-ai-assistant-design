import type { Context } from "hono";

import type { ApiEnv } from "../../../contracts";
import {
  createSuccessResponse,
  respondWithError,
  respondWithServiceError,
} from "../../../http";
import {
  getRequiredKnowledgeActor,
  getValidatedInput,
} from "../../../middleware";
import type { DocumentsRouteDependencies } from "../dependencies";
import type { DocumentProcessingListQuery } from "../types";

type ListDocumentProcessingContext = Context<
  ApiEnv,
  "/api/knowledge-bases/:knowledgeBaseId/documents/processing"
>;

export async function listDocumentProcessingProcedure(
  context: ListDocumentProcessingContext,
  dependencies: DocumentsRouteDependencies,
): Promise<Response> {
  const knowledgeBaseId = context.req.param("knowledgeBaseId");
  if (knowledgeBaseId.length === 0) {
    return respondWithError(context, {
      code: "VALIDATION_ERROR",
      httpStatus: 400,
      message: "知识库参数无效。",
    });
  }

  const result = await dependencies.documentService.listDocumentProcessing({
    actor: getRequiredKnowledgeActor(context),
    knowledgeBaseId,
    query: getValidatedInput<DocumentProcessingListQuery>(
      context,
      "documentProcessingListQuery",
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
