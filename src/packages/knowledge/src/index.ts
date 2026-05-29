import { z } from "zod";

export {
  createKnowledgeBaseInputSchema,
  documentFileUploadResultSchema,
  knowledgeBaseDetailSchema,
  knowledgeBaseListQuerySchema,
  knowledgeBaseMemberSummarySchema,
  knowledgeBasesPageSchema,
  knowledgeBaseSummarySchema,
  normalizeKnowledgeBaseMemberIds,
  normalizeKnowledgeBaseName,
  updateKnowledgeBaseInputSchema,
} from "./contracts/schemas";
export type {
  CreateKnowledgeBaseInput,
  DocumentFileUploadResult,
  KnowledgeBaseDetail,
  KnowledgeBaseListQuery,
  KnowledgeBaseMemberSummary,
  KnowledgeBasesPage,
  KnowledgeBaseSummary,
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
