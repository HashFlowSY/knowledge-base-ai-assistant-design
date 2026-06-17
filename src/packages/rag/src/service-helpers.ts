import { forbidden, internalError, notFound, type AppError } from "@kb/errors";

import { assembleRagContext } from "./context";
import type {
  ChatMessage,
  RankedRetrievalCandidate,
  RetrievalSourceCandidate,
} from "./types";
import type {
  RagAnswerGenerator,
  RagChatRepository,
  RagEmbeddingProvider,
  RagKeywordSearcher,
  RagReranker,
} from "./service-types";

export const ragRetrievalDefaults = {
  fusedTopK: 50,
  keywordTopK: 30,
  maxContextTokens: 6_000,
  recentHistoryLimit: 6,
  rerankedTopK: 8,
  vectorTopK: 30,
} as const;

export interface RagLogger {
  warn(event: string, fields?: Record<string, unknown>): void;
}

export function forbiddenKnowledgeBase(): AppError {
  return forbidden({
    domain: "rag",
    reason: "knowledge_base_forbidden",
    message: "无权访问该知识库。",
  });
}

export function chatResourceNotFound(): AppError {
  return notFound({
    domain: "rag",
    reason: "chat_resource_not_found",
    message: "会话或消息不存在，或你没有访问权限。",
  });
}

export async function retrieveCandidates(input: {
  embeddingProvider: RagEmbeddingProvider;
  keywordSearcher: RagKeywordSearcher;
  knowledgeBaseId: string;
  query: string;
  repository: RagChatRepository;
  requestId: string;
  retrievalRunId: string;
  tenantId: string;
}): Promise<{
  keyword: RetrievalSourceCandidate[];
  vector: RetrievalSourceCandidate[];
}> {
  const embedding = await input.embeddingProvider.embedQuery({
    query: input.query,
    requestId: input.requestId,
    tenantId: input.tenantId,
  });
  const [vector, keyword] = await Promise.all([
    embedding.ok
      ? input.repository.vectorSearch({
          knowledgeBaseId: input.knowledgeBaseId,
          limit: ragRetrievalDefaults.vectorTopK,
          tenantId: input.tenantId,
          vector: embedding.vector,
        })
      : Promise.resolve([]),
    searchKeywords(input),
  ]);

  return { keyword, vector };
}

async function searchKeywords(input: {
  keywordSearcher: RagKeywordSearcher;
  knowledgeBaseId: string;
  query: string;
  requestId: string;
  retrievalRunId: string;
  tenantId: string;
}): Promise<RetrievalSourceCandidate[]> {
  try {
    return await input.keywordSearcher.search({
      knowledgeBaseId: input.knowledgeBaseId,
      limit: ragRetrievalDefaults.keywordTopK,
      query: input.query,
      tenantId: input.tenantId,
    });
  } catch (error) {
    throw internalError(
      {
        domain: "search",
        reason: "keyword_search_failed",
        message: "关键词检索失败，请稍后重试。",
        metadata: {
          knowledgeBaseId: input.knowledgeBaseId,
          requestId: input.requestId,
          retrievalRunId: input.retrievalRunId,
          tenantId: input.tenantId,
        },
      },
      { cause: error },
    );
  }
}

export async function rankCandidates(input: {
  candidates: RankedRetrievalCandidate[];
  logger: RagLogger | undefined;
  query: string;
  requestId: string;
  reranker: RagReranker;
  tenantId: string;
}): Promise<{ candidates: RankedRetrievalCandidate[]; fallbackUsed: boolean }> {
  const rerank = await input.reranker.rerank(input);
  if (!rerank.ok) {
    input.logger?.warn("provider.rerank_unavailable", {
      candidateCount: input.candidates.length,
      code: rerank.code,
      requestId: input.requestId,
      tenantId: input.tenantId,
    });
    return {
      candidates: input.candidates.slice(0, ragRetrievalDefaults.rerankedTopK),
      fallbackUsed: true,
    };
  }

  const scores = new Map(rerank.results.map((item) => [item.chunkId, item.score]));
  return {
    candidates: input.candidates
      .map((candidate) => ({
        ...candidate,
        rerankScore: scores.get(candidate.chunkId) ?? 0,
      }))
      .sort((left, right) => (right.rerankScore ?? 0) - (left.rerankScore ?? 0))
      .slice(0, ragRetrievalDefaults.rerankedTopK)
      .map((candidate, index) => ({ ...candidate, rank: index + 1 })),
    fallbackUsed: false,
  };
}

export function assembleRankedContext(input: {
  candidates: RankedRetrievalCandidate[];
}): ReturnType<typeof assembleRagContext> {
  return assembleRagContext({
    candidates: input.candidates.slice(0, ragRetrievalDefaults.rerankedTopK),
    maxChunks: ragRetrievalDefaults.rerankedTopK,
    maxContextTokens: ragRetrievalDefaults.maxContextTokens,
  });
}

export async function appendNoAnswer(input: {
  actor: Parameters<RagChatRepository["appendMessage"]>[0]["actor"];
  knowledgeBaseId: string;
  repository: RagChatRepository;
  retrievalRunId: string;
  sessionId: string;
}): Promise<ChatMessage> {
  return input.repository.appendMessage({
    actor: input.actor,
    citations: [],
    content: "知识库中没有找到可支撑答案。",
    groundingLabel: "未找到依据",
    knowledgeBaseId: input.knowledgeBaseId,
    retrievalRunId: input.retrievalRunId,
    role: "assistant",
    sessionId: input.sessionId,
  });
}

export async function appendGroundedAnswer(input: {
  actor: Parameters<RagChatRepository["appendMessage"]>[0]["actor"];
  answerGenerator: RagAnswerGenerator;
  candidates: RankedRetrievalCandidate[];
  contextText: string;
  groundingLabel: "依据充分" | "依据有限";
  history: ChatMessage[];
  knowledgeBaseId: string;
  question: string;
  repository: RagChatRepository;
  requestId: string;
  retrievalRunId: string;
  sessionId: string;
  tenantId: string;
}): Promise<ChatMessage> {
  const generated = await input.answerGenerator.generate({
    context: input.contextText,
    history: input.history,
    question: input.question,
    requestId: input.requestId,
    tenantId: input.tenantId,
  });

  return input.repository.appendMessage({
    actor: input.actor,
    citations: input.candidates,
    content: generated.ok ? generated.text : "模型服务暂时不可用，请稍后重试。",
    groundingLabel: input.groundingLabel,
    knowledgeBaseId: input.knowledgeBaseId,
    retrievalRunId: input.retrievalRunId,
    role: "assistant",
    sessionId: input.sessionId,
  });
}

export function createSessionTitle(question: string): string {
  return question.length <= 24 ? question : `${question.slice(0, 24)}...`;
}
