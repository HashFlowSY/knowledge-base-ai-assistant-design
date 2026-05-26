import { z } from "zod";

const meiliHitSchema = z.object({
  chunkId: z.string().min(1),
  chunkIndex: z.number().int().min(0),
  content: z.string().min(1),
  documentId: z.string().min(1),
  documentTitle: z.string().min(1).optional(),
  knowledgeBaseId: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
  sourceLocator: z.string().nullable().optional(),
  sourceUri: z.string().min(1).optional(),
  tokenEstimate: z.number().int().min(0).optional(),
  _rankingScore: z.number().optional(),
});

const meiliSearchResponseSchema = z.object({
  hits: z.array(meiliHitSchema),
});

export interface KeywordSearchInput {
  knowledgeBaseId: string;
  limit: number;
  query: string;
  tenantId: string;
}

export interface KeywordSearcher {
  search(input: KeywordSearchInput): Promise<KeywordSearchResult[]>;
}

export interface KeywordSearchResult {
  chunkId: string;
  chunkIndex: number;
  content: string;
  documentId: string;
  documentTitle: string;
  knowledgeBaseId: string;
  metadata: Record<string, unknown>;
  score: number;
  sourceLocator: string | null;
  sourceUri: string;
  tokenEstimate: number;
}

export interface MeiliKeywordSearcherOptions {
  apiKey: string;
  fetcher?: typeof fetch;
  host: string;
  indexUid?: string;
}

export function createMeiliKeywordSearcher(
  options: MeiliKeywordSearcherOptions,
): KeywordSearcher {
  const fetcher = options.fetcher ?? fetch;
  const host = options.host.replace(/\/+$/, "");
  const indexUid = options.indexUid ?? "kb_chunks";

  return {
    async search(input) {
      const response = await fetcher(`${host}/indexes/${indexUid}/search`, {
        body: JSON.stringify({
          filter: [
            `tenantId = "${escapeMeiliFilterValue(input.tenantId)}"`,
            `knowledgeBaseId = "${escapeMeiliFilterValue(input.knowledgeBaseId)}"`,
          ],
          limit: input.limit,
          q: input.query,
          showRankingScore: true,
        }),
        headers: {
          authorization: `Bearer ${options.apiKey}`,
          "content-type": "application/json",
        },
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Keyword search failed.");
      }

      const parsed = meiliSearchResponseSchema.parse(await response.json());
      return parsed.hits.map((hit) => ({
        chunkId: hit.chunkId,
        chunkIndex: hit.chunkIndex,
        content: hit.content,
        documentId: hit.documentId,
        documentTitle: hit.documentTitle ?? "未命名文档",
        knowledgeBaseId: hit.knowledgeBaseId,
        metadata: hit.metadata ?? {},
        score: hit._rankingScore ?? 0,
        sourceLocator: hit.sourceLocator ?? null,
        sourceUri: hit.sourceUri ?? hit.documentId,
        tokenEstimate: hit.tokenEstimate ?? estimateTokens(hit.content),
      }));
    },
  };
}

function estimateTokens(content: string): number {
  return Math.max(1, Math.ceil(content.length / 4));
}

function escapeMeiliFilterValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
