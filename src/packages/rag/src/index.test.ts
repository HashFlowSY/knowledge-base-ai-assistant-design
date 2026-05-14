import { describe, expect, it } from "vitest";

import { retrievalCandidateSchema } from "./index";

describe("@kb/rag", () => {
  it("preserves citation identifiers on retrieval candidates", () => {
    expect(
      retrievalCandidateSchema.parse({
        chunkId: "chunk_1",
        documentId: "doc_1",
        knowledgeBaseId: "kb_1",
        score: 0.8,
        source: "vector",
      }),
    ).toMatchObject({
      chunkId: "chunk_1",
      documentId: "doc_1",
      knowledgeBaseId: "kb_1",
    });
  });
});
