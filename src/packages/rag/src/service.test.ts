import { describe, expect, it } from "vitest";

import { createRagChatService } from "./service";
import type { RagChatRepository } from "./service-types";
import {
  actor,
  createAnswerGenerator,
  createEmbeddingProvider,
  createKeywordSearcher,
  createRepository,
  createReranker,
} from "./service.test-fixtures";

describe("RAG chat service", () => {
  it("uses hybrid retrieval and caps grounding when rerank falls back", async () => {
    const calls: string[] = [];
    const serviceInput = {
      answerGenerator: createAnswerGenerator(calls),
      embeddingProvider: createEmbeddingProvider(calls),
      keywordSearcher: createKeywordSearcher(calls),
      logger: {
        warn(event: string) {
          calls.push(`log:${event}`);
        },
      },
      repository: createRepository(calls),
      reranker: {
        async rerank() {
          calls.push("rerank");
          return { ok: false as const, code: "PROVIDER_UNAVAILABLE" };
        },
      },
    };
    const service = createRagChatService(serviceInput);

    const result = await service.submitQuestion({
      actor,
      body: {
        knowledgeBaseId: "kb_1",
        question: "差旅住宿标准是多少？",
        sessionId: null,
      },
      requestId: "req_1",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(calls).toEqual([
      "authorize",
      "createSession",
      "append:user",
      "startRun",
      "history",
      "embedding",
      "vector",
      "keyword",
      "rerank",
      "log:provider.rerank_unavailable",
      "recordResults",
      "completeRun",
      "answer",
      "append:assistant",
    ]);
    expect(result.result.assistantMessage.groundingLabel).toBe("依据有限");
    expect(result.result.assistantMessage.retrievalRunId).toBe("run_1");
    expect(result.result.assistantMessage.citations[0]).toMatchObject({
      chunkId: "chunk_b",
      retrievalRunId: "run_1",
      sourceTitle: "差旅制度",
    });
  });

  it("rejects unauthorized knowledge bases before creating sessions or retrieving", async () => {
    const calls: string[] = [];
    const service = createRagChatService({
      answerGenerator: createAnswerGenerator(calls),
      embeddingProvider: createEmbeddingProvider(calls),
      keywordSearcher: createKeywordSearcher(calls),
      repository: createRepository(calls, { hasAccess: false }),
      reranker: createReranker(calls),
    });

    await expect(
      service.submitQuestion({
        actor,
        body: {
          knowledgeBaseId: "kb_forbidden",
          question: "不能访问的问题",
          sessionId: null,
        },
        requestId: "req_forbidden",
      }),
    ).rejects.toMatchObject({
      data: {
        code: "FORBIDDEN",
        domain: "rag",
        httpStatus: 403,
        reason: "knowledge_base_forbidden",
      },
    });
    expect(calls).toEqual(["authorize"]);
  });

  it("rejects unauthorized knowledge-base session filters", async () => {
    const calls: string[] = [];
    const service = createRagChatService({
      answerGenerator: createAnswerGenerator(calls),
      embeddingProvider: createEmbeddingProvider(calls),
      keywordSearcher: createKeywordSearcher(calls),
      repository: createRepository(calls, { hasAccess: false }),
      reranker: createReranker(calls),
    });

    await expect(
      service.listSessions({
        actor,
        query: { knowledgeBaseId: "kb_forbidden" },
      }),
    ).rejects.toMatchObject({
      data: {
        code: "FORBIDDEN",
        domain: "rag",
        httpStatus: 403,
        reason: "knowledge_base_forbidden",
      },
    });
    expect(calls).toEqual(["authorize"]);
  });

  it("rejects continuing an inaccessible session before persisting messages", async () => {
    const calls: string[] = [];
    const service = createRagChatService({
      answerGenerator: createAnswerGenerator(calls),
      embeddingProvider: createEmbeddingProvider(calls),
      keywordSearcher: createKeywordSearcher(calls),
      repository: createRepository(calls, { hasSessionAccess: false }),
      reranker: createReranker(calls),
    });

    await expect(
      service.submitQuestion({
        actor,
        body: {
          knowledgeBaseId: "kb_1",
          question: "继续上一轮问题",
          sessionId: "session_forbidden",
        },
        requestId: "req_session_forbidden",
      }),
    ).rejects.toMatchObject({
      data: {
        code: "NOT_FOUND",
        domain: "rag",
        httpStatus: 404,
        reason: "chat_resource_not_found",
      },
    });
    expect(calls).not.toContain("append:user");
    expect(calls).not.toContain("vector");
  });

  it("returns not found for inaccessible feedback targets", async () => {
    const calls: string[] = [];
    const service = createRagChatService({
      answerGenerator: createAnswerGenerator(calls),
      embeddingProvider: createEmbeddingProvider(calls),
      keywordSearcher: createKeywordSearcher(calls),
      repository: createRepository(calls, { hasMessageAccess: false }),
      reranker: createReranker(calls),
    });

    await expect(
      service.submitFeedback({
        actor,
        body: {
          citationIds: ["citation_forbidden"],
          rating: "not_useful",
          reason: "来源不匹配",
        },
        messageId: "msg_forbidden",
      }),
    ).rejects.toMatchObject({
      data: {
        code: "NOT_FOUND",
        domain: "rag",
        httpStatus: 404,
        reason: "chat_resource_not_found",
      },
    });
    expect(calls).toEqual(["saveFeedback"]);
  });

  it("returns not found when repository denies current knowledge-base access for messages", async () => {
    const calls: string[] = [];
    const repository = {
      ...createRepository(calls),
      async listMessages() {
        calls.push("listMessages");
        return null;
      },
    } as unknown as RagChatRepository;
    const service = createRagChatService({
      answerGenerator: createAnswerGenerator(calls),
      embeddingProvider: createEmbeddingProvider(calls),
      keywordSearcher: createKeywordSearcher(calls),
      repository,
      reranker: createReranker(calls),
    });

    await expect(
      service.listMessages({
        actor,
        sessionId: "session_revoked",
      }),
    ).rejects.toMatchObject({
      data: {
        code: "NOT_FOUND",
        domain: "rag",
        httpStatus: 404,
        reason: "chat_resource_not_found",
      },
    });
    expect(calls).toEqual(["listMessages"]);
  });

  it("returns not found when feedback write loses current knowledge-base access", async () => {
    const calls: string[] = [];
    const repository = {
      ...createRepository(calls),
      async saveFeedback() {
        calls.push("saveFeedback");
        return null;
      },
    } as unknown as RagChatRepository;
    const service = createRagChatService({
      answerGenerator: createAnswerGenerator(calls),
      embeddingProvider: createEmbeddingProvider(calls),
      keywordSearcher: createKeywordSearcher(calls),
      repository,
      reranker: createReranker(calls),
    });

    await expect(
      service.submitFeedback({
        actor,
        body: {
          citationIds: ["citation_revoked"],
          rating: "not_useful",
          reason: "已失权",
        },
        messageId: "msg_revoked",
      }),
    ).rejects.toMatchObject({
      data: {
        code: "NOT_FOUND",
        domain: "rag",
        httpStatus: 404,
        reason: "chat_resource_not_found",
      },
    });
    expect(calls).toEqual(["saveFeedback"]);
  });

  it("marks retrieval runs failed when keyword search fails", async () => {
    const calls: string[] = [];
    const failedRuns: Parameters<
      RagChatRepository["completeRetrievalRun"]
    >[0][] = [];
    const repository = {
      ...createRepository(calls),
      async completeRetrievalRun(input) {
        calls.push(`completeRun:${input.status}`);
        failedRuns.push(input);
      },
    } satisfies RagChatRepository;
    const service = createRagChatService({
      answerGenerator: createAnswerGenerator(calls),
      embeddingProvider: createEmbeddingProvider(calls),
      keywordSearcher: {
        async search() {
          calls.push("keyword");
          throw new Error("keyword search failed token=secret_token");
        },
      },
      repository,
      reranker: createReranker(calls),
    });

    await expect(
      service.submitQuestion({
        actor,
        body: {
          knowledgeBaseId: "kb_1",
          question: "检索失败时如何处理？",
          sessionId: null,
        },
        requestId: "req_keyword_failed",
      }),
    ).rejects.toMatchObject({
      data: {
        code: "INTERNAL_ERROR",
        domain: "search",
        httpStatus: 500,
        metadata: {
          knowledgeBaseId: "kb_1",
          requestId: "req_keyword_failed",
          retrievalRunId: "run_1",
          tenantId: "tenant_1",
        },
        reason: "keyword_search_failed",
      },
    });

    expect(failedRuns).toEqual([
      expect.objectContaining({
        errorCode: "keyword_search_failed",
        errorMessage: "关键词检索失败，请稍后重试。",
        retrievalRunId: "run_1",
        status: "failed",
      }),
    ]);
    expect(calls).toEqual([
      "authorize",
      "createSession",
      "append:user",
      "startRun",
      "history",
      "embedding",
      "vector",
      "keyword",
      "completeRun:failed",
    ]);
  });

  it("returns a no-answer message when retrieval has no usable context", async () => {
    const service = createRagChatService({
      answerGenerator: createAnswerGenerator([]),
      embeddingProvider: createEmbeddingProvider([]),
      keywordSearcher: { async search() { return []; } },
      repository: createRepository([], { vectorResults: [] }),
      reranker: createReranker([]),
    });

    const result = await service.submitQuestion({
      actor,
      body: {
        knowledgeBaseId: "kb_1",
        question: "没有资料的问题",
        sessionId: null,
      },
      requestId: "req_2",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.result.assistantMessage).toMatchObject({
      content: "知识库中没有找到可支撑答案。",
      groundingLabel: "未找到依据",
      citations: [],
    });
  });
});
