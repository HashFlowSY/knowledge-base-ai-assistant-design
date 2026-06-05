import type { Context } from "hono";
import { ZodError } from "zod";

import type { ApiEnv } from "../../../contracts";
import {
  createSuccessResponse,
  respondWithError,
  respondWithServiceError,
} from "../../../http";
import {
  requireKnowledgeBaseSession,
  respondAfterUnresolvedKnowledgeBaseRateLimit,
  toKnowledgeActor,
  validateJsonMutationRequest,
} from "../../../guards";
import type { DocumentsRouteDependencies } from "../dependencies";
import { retryDocumentProcessingBodySchema } from "../types";

type RetryDocumentProcessingContext = Context<
  ApiEnv,
  "/api/knowledge-bases/:knowledgeBaseId/documents/:documentId/retry"
>;

export async function retryDocumentProcessingProcedure(
  context: RetryDocumentProcessingContext,
  dependencies: DocumentsRouteDependencies,
): Promise<Response> {
  const mutationResponse = validateJsonMutationRequest(
    context,
    dependencies.allowedOrigins,
  );
  if (mutationResponse !== null) {
    return respondAfterUnresolvedKnowledgeBaseRateLimit(
      context,
      dependencies.rateLimiter,
      mutationResponse,
    );
  }

  const authResult = await requireKnowledgeBaseSession(
    context,
    dependencies.authService,
    dependencies.rateLimiter,
  );
  if (!authResult.ok) {
    return authResult.response;
  }

  const knowledgeBaseId = context.req.param("knowledgeBaseId");
  const documentId = context.req.param("documentId");
  if (knowledgeBaseId.length === 0 || documentId.length === 0) {
    return respondWithError(context, {
      code: "VALIDATION_ERROR",
      httpStatus: 400,
      message: "文档参数无效。",
    });
  }

  try {
    retryDocumentProcessingBodySchema.parse(await context.req.json());
  } catch (error) {
    if (error instanceof ZodError) {
      return respondWithError(context, {
        code: "VALIDATION_ERROR",
        httpStatus: 400,
        message: "请提交有效的重试请求。",
        validationErrors: error.issues.map((issue) => ({
          message: issue.message,
          path: issue.path,
        })),
      });
    }

    return respondWithError(context, {
      code: "VALIDATION_ERROR",
      httpStatus: 400,
      message: "请提交有效的 JSON 请求体。",
    });
  }

  const result = await dependencies.documentService.retryDocumentProcessing({
    actor: toKnowledgeActor(authResult.actor),
    documentId,
    knowledgeBaseId,
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
