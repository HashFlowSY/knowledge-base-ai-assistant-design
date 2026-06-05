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
