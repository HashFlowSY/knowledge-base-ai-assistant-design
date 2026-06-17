import type { Context } from "hono";

import type { ApiEnv } from "../../../contracts";
import { createSuccessResponse } from "../../../http";
import {
  getRequiredKnowledgeActor,
  getValidatedInput,
} from "../../../middleware";
import type { DocumentsRouteDependencies } from "../dependencies";
import type {
  DocumentKnowledgeBaseParams,
  DocumentProcessingListQuery,
} from "../types";

type ListDocumentProcessingContext = Context<
  ApiEnv,
  "/api/knowledge-bases/:knowledgeBaseId/documents/processing"
>;

export async function listDocumentProcessingProcedure(
  context: ListDocumentProcessingContext,
  dependencies: DocumentsRouteDependencies,
): Promise<Response> {
  const params = getValidatedInput<DocumentKnowledgeBaseParams>(
    context,
    "documentKnowledgeBaseParams",
  );

  const result = await dependencies.documentService.listDocumentProcessing({
    actor: getRequiredKnowledgeActor(context),
    knowledgeBaseId: params.knowledgeBaseId,
    query: getValidatedInput<DocumentProcessingListQuery>(
      context,
      "documentProcessingListQuery",
    ),
  });

  return context.json(
    createSuccessResponse({
      data: result.page,
      httpStatus: 200,
      requestId: context.get("requestId"),
    }),
    200,
  );
}
