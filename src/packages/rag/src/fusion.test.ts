import { describe, expect, it } from "vitest";

import { fuseRetrievalCandidates } from "./fusion";

describe("hybrid retrieval fusion", () => {
  it("deduplicates by chunk id with RRF and preserves source ranks and scores", () => {
    const fused = fuseRetrievalCandidates({
      fusedLimit: 3,
      keyword: [
        {
          chunkId: "chunk_b",
          content: "关键词结果 B",
          documentId: "doc_2",
          documentTitle: "制度 B",
          knowledgeBaseId: "kb_1",
          score: 0.91,
          sourceLocator: "P2",
          sourceUri: "s3://doc-b",
          tokenEstimate: 20,
          chunkIndex: 1,
          metadata: {},
        },
        {
          chunkId: "chunk_c",
          content: "关键词结果 C",
          documentId: "doc_3",
          documentTitle: "制度 C",
          knowledgeBaseId: "kb_1",
          score: 0.7,
          sourceLocator: "P3",
          sourceUri: "s3://doc-c",
          tokenEstimate: 20,
          chunkIndex: 0,
          metadata: {},
        },
      ],
      vector: [
        {
          chunkId: "chunk_a",
          content: "向量结果 A",
          documentId: "doc_1",
          documentTitle: "制度 A",
          knowledgeBaseId: "kb_1",
          score: 0.95,
          sourceLocator: "P1",
          sourceUri: "s3://doc-a",
          tokenEstimate: 20,
          chunkIndex: 0,
          metadata: {},
        },
        {
          chunkId: "chunk_b",
          content: "向量结果 B",
          documentId: "doc_2",
          documentTitle: "制度 B",
          knowledgeBaseId: "kb_1",
          score: 0.6,
          sourceLocator: "P2",
          sourceUri: "s3://doc-b",
          tokenEstimate: 20,
          chunkIndex: 1,
          metadata: {},
        },
      ],
    });

    expect(fused.map((candidate) => candidate.chunkId)).toEqual([
      "chunk_b",
      "chunk_a",
      "chunk_c",
    ]);
    expect(fused[0]).toMatchObject({
      chunkId: "chunk_b",
      keywordRank: 1,
      keywordScore: 0.91,
      vectorRank: 2,
      vectorScore: 0.6,
      source: "hybrid",
    });
    expect(fused[0]?.fusedScore).toBeGreaterThan(fused[1]?.fusedScore ?? 0);
  });
});
