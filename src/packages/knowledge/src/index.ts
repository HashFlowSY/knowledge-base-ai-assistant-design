import { z } from "zod";

export {
  createKnowledgeBaseInputSchema,
  knowledgeBaseDetailSchema,
  knowledgeBaseListQuerySchema,
  knowledgeBaseMemberSummarySchema,
  knowledgeBasesPageSchema,
  knowledgeBaseSummarySchema,
  normalizeKnowledgeBaseMemberIds,
  normalizeKnowledgeBaseName,
  updateKnowledgeBaseInputSchema,
} from "./schemas";
export type {
  CreateKnowledgeBaseInput,
  KnowledgeBaseDetail,
  KnowledgeBaseListQuery,
  KnowledgeBaseMemberSummary,
  KnowledgeBasesPage,
  KnowledgeBaseSummary,
  UpdateKnowledgeBaseInput,
} from "./schemas";

export const knowledgeBaseScopeSchema = z.object({
  tenantId: z.string().min(1),
  knowledgeBaseId: z.string().min(1),
});

export type KnowledgeBaseScope = z.infer<typeof knowledgeBaseScopeSchema>;

export const documentStatusSchema = z.enum([
  "draft",
  "queued",
  "processing",
  "ready",
  "failed",
]);

export type DocumentStatus = z.infer<typeof documentStatusSchema>;
