import { z } from "zod";

export const searchBackendSchema = z.enum(["meilisearch", "pgvector"]);

export type SearchBackend = z.infer<typeof searchBackendSchema>;

export const authorizedSearchScopeSchema = z.object({
  tenantId: z.string().min(1),
  knowledgeBaseIds: z.array(z.string().min(1)).min(1),
});

export type AuthorizedSearchScope = z.infer<typeof authorizedSearchScopeSchema>;
