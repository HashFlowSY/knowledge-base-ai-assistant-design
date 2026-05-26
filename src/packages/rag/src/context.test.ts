import { describe, expect, it } from "vitest";

import { assembleRagContext } from "./context";
import type { RankedRetrievalCandidate } from "./types";

describe("RAG context assembly", () => {
  it("merges only adjacent chunks from the same document and keeps citation mapping", () => {
    const context = assembleRagContext({
      candidates: [
        candidate({ chunkId: "chunk_1", chunkIndex: 0, content: "第一段", rank: 1 }),
        candidate({ chunkId: "chunk_2", chunkIndex: 1, content: "第二段", rank: 2 }),
        candidate({
          chunkId: "chunk_9",
          chunkIndex: 3,
          content: "不相邻段落",
          rank: 3,
        }),
      ],
      maxContextTokens: 100,
      maxChunks: 8,
    });

    expect(context.items).toHaveLength(2);
    expect(context.items[0]).toMatchObject({
      chunkIds: ["chunk_1", "chunk_2"],
      content: "第一段\n\n第二段",
      rank: 1,
    });
    expect(context.citations.map((citation) => citation.chunkId)).toEqual([
      "chunk_1",
      "chunk_2",
      "chunk_9",
    ]);
  });

  it("truncates by rerank order when the context budget is reached", () => {
    const context = assembleRagContext({
      candidates: [
        candidate({ chunkId: "chunk_1", tokenEstimate: 40, rank: 1 }),
        candidate({ chunkId: "chunk_2", tokenEstimate: 40, rank: 2 }),
        candidate({ chunkId: "chunk_3", tokenEstimate: 40, rank: 3 }),
      ],
      maxContextTokens: 80,
      maxChunks: 8,
    });

    expect(context.citations.map((citation) => citation.chunkId)).toEqual([
      "chunk_1",
      "chunk_2",
    ]);
    expect(context.usedTokenEstimate).toBe(80);
  });
});

function candidate(
  input: Partial<RankedRetrievalCandidate> & Pick<RankedRetrievalCandidate, "chunkId">,
): RankedRetrievalCandidate {
  return {
    chunkId: input.chunkId,
    chunkIndex: input.chunkIndex ?? 0,
    content: input.content ?? input.chunkId,
    documentId: input.documentId ?? "doc_1",
    documentTitle: input.documentTitle ?? "制度文档",
    fusedScore: input.fusedScore ?? 0.1,
    knowledgeBaseId: input.knowledgeBaseId ?? "kb_1",
    metadata: input.metadata ?? {},
    rank: input.rank ?? 1,
    source: input.source ?? "hybrid",
    sourceLocator: input.sourceLocator ?? "P1",
    sourceUri: input.sourceUri ?? "s3://doc",
    tokenEstimate: input.tokenEstimate ?? 10,
  };
}
