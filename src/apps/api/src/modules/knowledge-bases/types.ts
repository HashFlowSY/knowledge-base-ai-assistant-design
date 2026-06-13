import { z } from "zod";

export {
  createKnowledgeBaseInputSchema,
  knowledgeBaseDetailSchema,
  knowledgeBaseListQuerySchema,
  knowledgeBaseMemberSummarySchema,
  knowledgeBasesPageSchema,
  knowledgeBaseSummarySchema,
  updateKnowledgeBaseInputSchema,
} from "@kb/knowledge";
export type {
  CreateKnowledgeBaseInput,
  KnowledgeBaseDetail,
  KnowledgeBaseListQuery,
  KnowledgeBaseMemberSummary,
  KnowledgeBasesPage,
  KnowledgeBaseSummary,
  UpdateKnowledgeBaseInput,
} from "@kb/knowledge";

export const knowledgeBaseParamsSchema = z.object({
  knowledgeBaseId: z.string().uuid(),
});

export type KnowledgeBaseParams = z.infer<typeof knowledgeBaseParamsSchema>;
