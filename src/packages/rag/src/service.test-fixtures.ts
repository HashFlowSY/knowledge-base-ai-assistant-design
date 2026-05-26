import type {
  RagAnswerGenerator,
  RagChatRepository,
  RagEmbeddingProvider,
  RagKeywordSearcher,
  RagReranker,
} from "./service-types";

export const actor = {
  user: { id: "user_1" },
  tenant: { id: "tenant_1" },
  role: "member" as const,
};

export function createRepository(
  calls: string[],
  options: {
    hasAccess?: boolean;
    hasMessageAccess?: boolean;
    hasSessionAccess?: boolean;
    vectorResults?: Awaited<ReturnType<RagChatRepository["vectorSearch"]>>;
  } = {},
): RagChatRepository {
  return {
    async appendMessage(input) {
      calls.push(`append:${input.role}`);
      return {
        citations:
          input.citations?.map((citation, index) => ({
            chunkId: citation.chunkId,
            documentId: citation.documentId,
            id: `citation_${index + 1}`,
            knowledgeBaseId: citation.knowledgeBaseId,
            messageId: "msg_assistant",
            rank: index + 1,
            retrievalRunId: input.retrievalRunId,
            snippet: citation.content,
            sourceLocator: citation.sourceLocator,
            sourceTitle: citation.documentTitle,
            sourceUri: citation.sourceUri,
          })) ?? [],
        content: input.content,
        createdAt: "2026-05-25T00:00:01.000Z",
        feedback: null,
        groundingLabel: input.groundingLabel,
        id: input.role === "user" ? "msg_user" : "msg_assistant",
        retrievalRunId: input.retrievalRunId,
        role: input.role,
        sequence: input.role === "user" ? 1 : 2,
        sessionId: input.sessionId,
      };
    },
    async authorizeKnowledgeBase() {
      calls.push("authorize");
      return options.hasAccess ?? true;
    },
    async completeRetrievalRun() {
      calls.push("completeRun");
    },
    async createSession(input) {
      calls.push("createSession");
      return {
        createdAt: "2026-05-25T00:00:00.000Z",
        id: "session_1",
        knowledgeBaseId: input.knowledgeBaseId,
        messageCount: 0,
        title: input.title,
        updatedAt: "2026-05-25T00:00:00.000Z",
      };
    },
    async canAccessMessage() {
      calls.push("canAccessMessage");
      return options.hasMessageAccess ?? true;
    },
    async getSession(input) {
      calls.push("getSession");
      return (options.hasSessionAccess ?? true)
        ? {
            createdAt: "2026-05-25T00:00:00.000Z",
            id: input.sessionId,
            knowledgeBaseId: input.knowledgeBaseId ?? "kb_1",
            messageCount: 2,
            title: "已有会话",
            updatedAt: "2026-05-25T00:00:00.000Z",
          }
        : null;
    },
    async listMessages() {
      return { messages: [] };
    },
    async listRecentMessages() {
      calls.push("history");
      return [];
    },
    async listSessions() {
      return { sessions: [] };
    },
    async saveFeedback() {
      calls.push("saveFeedback");
      return {
        feedback: {
          createdAt: "2026-05-25T00:00:03.000Z",
          id: "feedback_1",
          rating: "useful",
          reason: null,
        },
      };
    },
    async recordRetrievalResults() {
      calls.push("recordResults");
    },
    async startRetrievalRun() {
      calls.push("startRun");
      return { id: "run_1" };
    },
    async vectorSearch() {
      calls.push("vector");
      return options.vectorResults ?? [
        {
          chunkId: "chunk_a",
          chunkIndex: 0,
          content: "普通差旅说明",
          documentId: "doc_1",
          documentTitle: "差旅说明",
          knowledgeBaseId: "kb_1",
          metadata: {},
          score: 0.8,
          sourceLocator: "P1",
          sourceUri: "s3://travel",
          tokenEstimate: 20,
        },
        {
          chunkId: "chunk_b",
          chunkIndex: 1,
          content: "住宿标准为 500 元",
          documentId: "doc_2",
          documentTitle: "差旅制度",
          knowledgeBaseId: "kb_1",
          metadata: {},
          score: 0.7,
          sourceLocator: "P2",
          sourceUri: "s3://policy",
          tokenEstimate: 20,
        },
      ];
    },
  };
}

export function createEmbeddingProvider(
  calls: string[],
): RagEmbeddingProvider {
  return {
    async embedQuery() {
      calls.push("embedding");
      return { ok: true, vector: [0.1, 0.2] };
    },
  };
}

export function createKeywordSearcher(calls: string[]): RagKeywordSearcher {
  return {
    async search() {
      calls.push("keyword");
      return [
        {
          chunkId: "chunk_b",
          chunkIndex: 1,
          content: "住宿标准为 500 元",
          documentId: "doc_2",
          documentTitle: "差旅制度",
          knowledgeBaseId: "kb_1",
          metadata: {},
          score: 0.95,
          sourceLocator: "P2",
          sourceUri: "s3://policy",
          tokenEstimate: 20,
        },
      ];
    },
  };
}

export function createReranker(calls: string[]): RagReranker {
  return {
    async rerank(input) {
      calls.push("rerank");
      return {
        ok: true,
        results: input.candidates.map((candidate, index) => ({
          chunkId: candidate.chunkId,
          score: 1 - index / 10,
        })),
      };
    },
  };
}

export function createAnswerGenerator(calls: string[]): RagAnswerGenerator {
  return {
    async generate() {
      calls.push("answer");
      return { ok: true, text: "差旅住宿标准为 500 元。" };
    },
  };
}
