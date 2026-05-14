import { z } from "zod";

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
