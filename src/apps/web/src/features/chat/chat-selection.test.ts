import type { ChatCitation, ChatMessage } from "@kb/rag";
import { describe, expect, it } from "vitest";

import { getActiveCitation, getVisibleAnswer } from "./chat-selection";

describe("chat citation selection", () => {
  it("shows the answer that owns the clicked citation instead of always using the latest answer", () => {
    const firstAnswer = createAssistantMessage("answer_1", [
      createCitation("citation_1", "answer_1", 1),
    ]);
    const latestAnswer = createAssistantMessage("answer_2", [
      createCitation("citation_2", "answer_2", 1),
    ]);

    expect(getVisibleAnswer([firstAnswer, latestAnswer], "citation_1")?.id).toBe(
      "answer_1",
    );
  });

  it("falls back to the latest assistant answer when no clicked citation is active", () => {
    const firstAnswer = createAssistantMessage("answer_1", [
      createCitation("citation_1", "answer_1", 1),
    ]);
    const latestAnswer = createAssistantMessage("answer_2", [
      createCitation("citation_2", "answer_2", 1),
    ]);

    expect(getVisibleAnswer([firstAnswer, latestAnswer], null)?.id).toBe(
      "answer_2",
    );
  });

  it("selects the clicked citation inside the visible answer", () => {
    const answer = createAssistantMessage("answer_1", [
      createCitation("citation_1", "answer_1", 1),
      createCitation("citation_2", "answer_1", 2),
    ]);

    expect(getActiveCitation(answer, "citation_2")?.id).toBe("citation_2");
  });
});

function createAssistantMessage(
  id: string,
  citations: ChatCitation[],
): ChatMessage {
  return {
    citations,
    content: `content for ${id}`,
    createdAt: "2026-06-03T00:00:00.000Z",
    feedback: null,
    groundingLabel: "依据充分",
    id,
    retrievalRunId: null,
    role: "assistant",
    sequence: Number(id.split("_")[1] ?? 1),
    sessionId: "session_1",
  };
}

function createCitation(
  id: string,
  messageId: string,
  rank: number,
): ChatCitation {
  return {
    chunkId: `chunk_${rank}`,
    documentId: `document_${rank}`,
    id,
    knowledgeBaseId: "kb_1",
    messageId,
    rank,
    retrievalRunId: null,
    snippet: `snippet ${rank}`,
    sourceLocator: `chars:${rank}`,
    sourceTitle: `document ${rank}`,
    sourceUri: `s3://document-${rank}`,
  };
}
