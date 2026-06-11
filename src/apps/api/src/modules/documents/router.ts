import { Hono } from "hono";
import { z } from "zod";

import type { ApiEnv } from "../../contracts";
import {
  createDocumentUploadPreflightMiddleware,
  createJsonBodyValidationMiddleware,
  createJsonMutationGuardMiddleware,
  createKnowledgeBaseRejectionRateLimitHandler,
  createKnowledgeBaseSessionMiddleware,
  createMultipartFormDataGuardMiddleware,
  createMutationGuardMiddleware,
  createParamValidationMiddleware,
  createQueryValidationMiddleware,
  createDocumentUploadRejectionRateLimitHandler,
} from "../../middleware";
import { listDocumentProcessingProcedure } from "./procedures/list-document-processing";
import { retryDocumentProcessingProcedure } from "./procedures/retry-document-processing";
import { uploadDocumentFileProcedure } from "./procedures/upload-document-file";
import type { DocumentsRouteDependencies } from "./dependencies";
import {
  documentProcessingListQuerySchema,
  retryDocumentProcessingBodySchema,
} from "./types";

const retryDocumentProcessingParamsSchema = z.object({
  documentId: z.string().min(1),
  knowledgeBaseId: z.string().min(1),
});

export function createDocumentsRouter(
  dependencies: DocumentsRouteDependencies,
): Hono<ApiEnv> {
  const router = new Hono<ApiEnv>();
  const requireSession = createKnowledgeBaseSessionMiddleware({
    authService: dependencies.authService,
    rateLimiter: dependencies.rateLimiter,
  });
  const rejectWithKnowledgeBaseRateLimit =
    createKnowledgeBaseRejectionRateLimitHandler(dependencies.rateLimiter);
  const rejectWithDocumentUploadRateLimit =
    createDocumentUploadRejectionRateLimitHandler(
      dependencies.rateLimiter,
      dependencies.uploadConfig.rateLimitPerMinute,
    );
  const jsonMutationGuard = createJsonMutationGuardMiddleware({
    allowedOrigins: dependencies.allowedOrigins,
    onRejected: rejectWithKnowledgeBaseRateLimit,
  });
  const uploadMutationGuard = createMutationGuardMiddleware({
    allowedOrigins: dependencies.allowedOrigins,
    onRejected: rejectWithDocumentUploadRateLimit,
  });

  router.post(
    "/api/knowledge-bases/:knowledgeBaseId/documents/upload",
    uploadMutationGuard,
    createMultipartFormDataGuardMiddleware({
      onRejected: rejectWithDocumentUploadRateLimit,
    }),
    createDocumentUploadPreflightMiddleware({
      authService: dependencies.authService,
      rateLimiter: dependencies.rateLimiter,
      uploadConcurrencyLimiter: dependencies.uploadConcurrencyLimiter,
      uploadConfig: dependencies.uploadConfig,
    }),
    (context) => uploadDocumentFileProcedure(context, dependencies),
  );
  router.get(
    "/api/knowledge-bases/:knowledgeBaseId/documents/processing",
    requireSession,
    createQueryValidationMiddleware(
      "documentProcessingListQuery",
      documentProcessingListQuerySchema,
    ),
    (context) => listDocumentProcessingProcedure(context, dependencies),
  );
  router.post(
    "/api/knowledge-bases/:knowledgeBaseId/documents/:documentId/retry",
    jsonMutationGuard,
    requireSession,
    createParamValidationMiddleware(
      "retryDocumentProcessingParams",
      retryDocumentProcessingParamsSchema,
    ),
    createJsonBodyValidationMiddleware(
      "retryDocumentProcessingBody",
      retryDocumentProcessingBodySchema,
    ),
    (context) => retryDocumentProcessingProcedure(context, dependencies),
  );

  return router;
}
