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
import type { DocumentsRouteDependencies } from "../dependencies";
import type { RetryDocumentProcessingParams } from "../types";

type RetryDocumentProcessingContext = Context<
  ApiEnv,
  "/api/knowledge-bases/:knowledgeBaseId/documents/:documentId/retry"
>;

export async function retryDocumentProcessingProcedure(
  context: RetryDocumentProcessingContext,
  dependencies: DocumentsRouteDependencies,
): Promise<Response> {
  const params = getValidatedInput<RetryDocumentProcessingParams>(
    context,
    "retryDocumentProcessingParams",
  );

  const result = await dependencies.documentService.retryDocumentProcessing({
    actor: getRequiredKnowledgeActor(context),
    documentId: params.documentId,
    knowledgeBaseId: params.knowledgeBaseId,
  });
  if (!result.ok) {
    return respondWithServiceError(context, result);
  }

  return context.json(
    createSuccessResponse({
      data: result.result,
      httpStatus: 200,
      requestId: context.get("requestId"),
    }),
    200,
  );
}
