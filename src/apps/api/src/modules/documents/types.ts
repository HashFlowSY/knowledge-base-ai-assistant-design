import { z } from "zod";

export {
  documentFileUploadResultSchema,
  documentProcessingListQuerySchema,
  documentProcessingPageSchema,
  documentProcessingSummarySchema,
  retryDocumentProcessingResultSchema,
} from "@kb/knowledge";
export type {
  DocumentFileUploadResult,
  DocumentProcessingListQuery,
  DocumentProcessingPage,
  DocumentProcessingSummary,
  RetryDocumentProcessingResult,
} from "@kb/knowledge";

export const retryDocumentProcessingBodySchema = z.object({}).strict();

export const documentKnowledgeBaseParamsSchema = z.object({
  knowledgeBaseId: z.string().uuid(),
});

export const retryDocumentProcessingParamsSchema = z.object({
  documentId: z.string().uuid(),
  knowledgeBaseId: z.string().uuid(),
});

export type DocumentKnowledgeBaseParams = z.infer<
  typeof documentKnowledgeBaseParamsSchema
>;
export type RetryDocumentProcessingParams = z.infer<
  typeof retryDocumentProcessingParamsSchema
>;
