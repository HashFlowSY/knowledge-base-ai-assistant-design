import { describe, expect, it } from "vitest";

import { createRagChatService } from "./service";
import type { RagAnswerGenerator, RagChatRepository } from "./service-types";
import type { ChatStreamEvent } from "./types";
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

  it("streams grounded answers in the required event order and persists the final answer", async () => {
    const calls: string[] = [];
    const service = createRagChatService({
      answerGenerator: createAnswerGenerator(calls),
      embeddingProvider: createEmbeddingProvider(calls),
      keywordSearcher: createKeywordSearcher(calls),
      repository: createRepository(calls),
      reranker: createReranker(calls),
    });

    const events = await collectStreamEvents(
      service.streamQuestion({
        actor,
        body: {
          knowledgeBaseId: "kb_1",
          question: "差旅住宿标准是多少？",
          sessionId: null,
        },
        requestId: "req_stream_success",
      }),
    );

    expect(events.map((event) => event.event)).toEqual([
      "session",
      "user_message",
      "retrieval_started",
      "retrieval_completed",
      "answer_delta",
      "answer_delta",
      "answer_completed",
    ]);
    expect(events[0]).toMatchObject({
      data: {
        requestId: "req_stream_success",
        session: { id: "session_1" },
      },
      event: "session",
    });
    expect(events.at(-1)).toMatchObject({
      data: {
        assistantMessage: {
          content: "差旅住宿标准为 500 元。",
          groundingLabel: "依据充分",
          retrievalRunId: "run_1",
        },
        session: {
          messageCount: 2,
        },
      },
      event: "answer_completed",
    });
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
      "recordResults",
      "completeRun",
      "answer:stream",
      "append:assistant",
    ]);
  });

  it("streams no-answer completion without answer deltas", async () => {
    const service = createRagChatService({
      answerGenerator: createAnswerGenerator([]),
      embeddingProvider: createEmbeddingProvider([]),
      keywordSearcher: { async search() { return []; } },
      repository: createRepository([], { vectorResults: [] }),
      reranker: createReranker([]),
    });

    const events = await collectStreamEvents(
      service.streamQuestion({
        actor,
        body: {
          knowledgeBaseId: "kb_1",
          question: "没有资料的问题",
          sessionId: null,
        },
        requestId: "req_stream_no_answer",
      }),
    );

    expect(events.map((event) => event.event)).toEqual([
      "session",
      "user_message",
      "retrieval_started",
      "retrieval_completed",
      "answer_completed",
    ]);
    expect(events.at(-1)).toMatchObject({
      data: {
        assistantMessage: {
          content: "知识库中没有找到可支撑答案。",
          groundingLabel: "未找到依据",
        },
      },
      event: "answer_completed",
    });
  });

  it("persists the provider fallback answer when streaming fails before any delta", async () => {
    const calls: string[] = [];
    const service = createRagChatService({
      answerGenerator: {
        async generate() {
          return { ok: false, code: "PROVIDER_UNAVAILABLE" };
        },
        async *stream() {
          calls.push("answer:stream");
          yield { type: "error" as const, code: "PROVIDER_UNAVAILABLE" };
        },
      },
      embeddingProvider: createEmbeddingProvider(calls),
      keywordSearcher: createKeywordSearcher(calls),
      repository: createRepository(calls),
      reranker: createReranker(calls),
    });

    const events = await collectStreamEvents(
      service.streamQuestion({
        actor,
        body: {
          knowledgeBaseId: "kb_1",
          question: "模型不可用时怎么处理？",
          sessionId: null,
        },
        requestId: "req_provider_before_delta",
      }),
    );

    expect(events.map((event) => event.event)).toEqual([
      "session",
      "user_message",
      "retrieval_started",
      "retrieval_completed",
      "answer_completed",
    ]);
    expect(events.at(-1)).toMatchObject({
      data: {
        assistantMessage: {
          content: "模型服务暂时不可用，请稍后重试。",
        },
      },
    });
    expect(calls).toContain("append:assistant");
  });

  it("emits a safe error without persisting partial answers after a streamed delta fails", async () => {
    const calls: string[] = [];
    const service = createRagChatService({
      answerGenerator: {
        async generate() {
          return { ok: false, code: "PROVIDER_UNAVAILABLE" };
        },
        async *stream() {
          calls.push("answer:stream");
          yield { type: "delta" as const, text: "部分回答" };
          yield { type: "error" as const, code: "PROVIDER_UNAVAILABLE" };
        },
      },
      embeddingProvider: createEmbeddingProvider(calls),
      keywordSearcher: createKeywordSearcher(calls),
      repository: createRepository(calls),
      reranker: createReranker(calls),
    });

    const events = await collectStreamEvents(
      service.streamQuestion({
        actor,
        body: {
          knowledgeBaseId: "kb_1",
          question: "流式中途失败怎么处理？",
          sessionId: null,
        },
        requestId: "req_provider_after_delta",
      }),
    );

    expect(events.map((event) => event.event)).toEqual([
      "session",
      "user_message",
      "retrieval_started",
      "retrieval_completed",
      "answer_delta",
      "error",
    ]);
    expect(events.at(-1)).toMatchObject({
      data: {
        code: "PROVIDER_UNAVAILABLE",
        message: "模型服务暂时不可用，请稍后重试。",
      },
      event: "error",
    });
    expect(calls).not.toContain("append:assistant");
  });

  it("persists final answers after provider done even if the caller aborts before completion delivery", async () => {
    const calls: string[] = [];
    const controller = new AbortController();
    const answerGenerator: RagAnswerGenerator = {
      async generate() {
        return { ok: true, text: "最终回答。" };
      },
      async *stream() {
        try {
          calls.push("answer:stream");
          yield { type: "delta" as const, text: "最终回答。" };
          yield { type: "done" as const };
        } finally {
          controller.abort();
        }
      },
    };
    const service = createRagChatService({
      answerGenerator,
      embeddingProvider: createEmbeddingProvider(calls),
      keywordSearcher: createKeywordSearcher(calls),
      repository: createRepository(calls),
      reranker: createReranker(calls),
    });

    const events = await collectStreamEvents(
      service.streamQuestion({
        actor,
        body: {
          knowledgeBaseId: "kb_1",
          question: "完成后断连怎么处理？",
          sessionId: null,
        },
        requestId: "req_provider_done_abort",
        signal: controller.signal,
      }),
    );

    expect(events.map((event) => event.event)).toContain("answer_completed");
    expect(calls).toContain("append:assistant");
  });
});

async function collectStreamEvents(
  stream: AsyncIterable<ChatStreamEvent>,
): Promise<ChatStreamEvent[]> {
  const events: ChatStreamEvent[] = [];
  for await (const event of stream) {
    events.push(event);
  }
  return events;
}
