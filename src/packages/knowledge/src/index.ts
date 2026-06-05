import { z } from "zod";

export {
  createKnowledgeBaseInputSchema,
  documentFileUploadResultSchema,
  documentProcessingListQuerySchema,
  documentProcessingPageSchema,
  documentProcessingSummarySchema,
  knowledgeBaseDetailSchema,
  knowledgeBaseListQuerySchema,
  knowledgeBaseMemberSummarySchema,
  knowledgeBasesPageSchema,
  knowledgeBaseSummarySchema,
  normalizeKnowledgeBaseMemberIds,
  normalizeKnowledgeBaseName,
  retryDocumentProcessingResultSchema,
  updateKnowledgeBaseInputSchema,
} from "./contracts/schemas";
export type {
  CreateKnowledgeBaseInput,
  DocumentFileUploadResult,
  DocumentProcessingListQuery,
  DocumentProcessingPage,
  DocumentProcessingSummary,
  KnowledgeBaseDetail,
  KnowledgeBaseListQuery,
  KnowledgeBaseMemberSummary,
  KnowledgeBasesPage,
  KnowledgeBaseSummary,
  RetryDocumentProcessingResult,
  UpdateKnowledgeBaseInput,
} from "./contracts/schemas";
export type { KnowledgeActor } from "./service/types";

export const knowledgeBaseScopeSchema = z.object({
  tenantId: z.string().min(1),
  knowledgeBaseId: z.string().min(1),
});

export type KnowledgeBaseScope = z.infer<typeof knowledgeBaseScopeSchema>;

export const documentStatusSchema = z.enum([
  "pending",
  "processing",
  "ready",
  "failed",
  "archived",
]);

export type DocumentStatus = z.infer<typeof documentStatusSchema>;
