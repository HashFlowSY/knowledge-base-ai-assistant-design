import { isAppError } from "@kb/errors";

import { fuseRetrievalCandidates } from "./fusion";
import {
  appendGroundedAnswer,
  appendNoAnswer,
  assembleRankedContext,
  chatResourceNotFound,
  createSessionTitle,
  forbiddenKnowledgeBase,
  ragRetrievalDefaults,
  rankCandidates,
  retrieveCandidates,
  type RagLogger,
} from "./service-helpers";
import type {
  RagAnswerGenerator,
  RagChatRepository,
  RagChatService,
  RagEmbeddingProvider,
  RagKeywordSearcher,
  RagReranker,
} from "./service-types";
import type {
  ChatMessage,
  ChatSessionSummary,
  ChatStreamEvent,
  GroundingLabel,
  RankedRetrievalCandidate,
} from "./types";

export function createRagChatService(input: {
  answerGenerator: RagAnswerGenerator;
  embeddingProvider: RagEmbeddingProvider;
  keywordSearcher: RagKeywordSearcher;
  logger?: RagLogger;
  repository: RagChatRepository;
  reranker: RagReranker;
}): RagChatService {
  return {
    async createSession(request) {
      const access = await input.repository.authorizeKnowledgeBase({
        actor: request.actor,
        knowledgeBaseId: request.body.knowledgeBaseId,
      });
      if (!access) {
        throw forbiddenKnowledgeBase();
      }

      const session = await input.repository.createSession({
        actor: request.actor,
        knowledgeBaseId: request.body.knowledgeBaseId,
        title: "新会话",
      });

      return { ok: true, result: { session } };
    },
    async listMessages(request) {
      const messages = await input.repository.listMessages(request);
      if (messages === null) {
        throw chatResourceNotFound();
      }

      return {
        ok: true,
        result: messages,
      };
    },
    async listSessions(request) {
      if (request.query.knowledgeBaseId !== undefined) {
        const access = await input.repository.authorizeKnowledgeBase({
          actor: request.actor,
          knowledgeBaseId: request.query.knowledgeBaseId,
        });
        if (!access) {
          throw forbiddenKnowledgeBase();
        }
      }

      return {
        ok: true,
        result: await input.repository.listSessions(request),
      };
    },
    async submitFeedback(request) {
      const feedback = await input.repository.saveFeedback(request);
      if (feedback === null) {
        throw chatResourceNotFound();
      }

      return {
        ok: true,
        result: feedback,
      };
    },
    async submitQuestion(request) {
      const question = request.body.question.trim();
      const access = await input.repository.authorizeKnowledgeBase({
        actor: request.actor,
        knowledgeBaseId: request.body.knowledgeBaseId,
      });
      if (!access) {
        throw forbiddenKnowledgeBase();
      }

      const session =
        request.body.sessionId === null
          ? await input.repository.createSession({
              actor: request.actor,
              knowledgeBaseId: request.body.knowledgeBaseId,
              title: createSessionTitle(question),
            })
          : await input.repository.getSession({
              actor: request.actor,
              knowledgeBaseId: request.body.knowledgeBaseId,
              sessionId: request.body.sessionId,
            });
      if (session === null) {
        throw chatResourceNotFound();
      }

      const userMessage = await input.repository.appendMessage({
        actor: request.actor,
        content: question,
        groundingLabel: null,
        knowledgeBaseId: request.body.knowledgeBaseId,
        retrievalRunId: null,
        role: "user",
        sessionId: session.id,
      });
      const retrievalRun = await input.repository.startRetrievalRun({
        actor: request.actor,
        knowledgeBaseId: request.body.knowledgeBaseId,
        messageId: userMessage.id,
        query: question,
        requestId: request.requestId,
        sessionId: session.id,
      });
      const history = await input.repository.listRecentMessages({
        actor: request.actor,
        limit: ragRetrievalDefaults.recentHistoryLimit,
        sessionId: session.id,
      });
      let reranked: Awaited<ReturnType<typeof rankCandidates>>;
      let context: ReturnType<typeof assembleRankedContext>;
      try {
        const candidates = await retrieveCandidates({
          embeddingProvider: input.embeddingProvider,
          keywordSearcher: input.keywordSearcher,
          repository: input.repository,
          knowledgeBaseId: request.body.knowledgeBaseId,
          query: question,
          requestId: request.requestId,
          retrievalRunId: retrievalRun.id,
          tenantId: request.actor.tenant.id,
        });
        const fused = fuseRetrievalCandidates({
          fusedLimit: ragRetrievalDefaults.fusedTopK,
          keyword: candidates.keyword,
          vector: candidates.vector,
        });
        reranked = await rankCandidates({
          candidates: fused.map((candidate, index) => ({
            ...candidate,
            rank: index + 1,
          })),
          query: question,
          requestId: request.requestId,
          logger: input.logger,
          reranker: input.reranker,
          tenantId: request.actor.tenant.id,
        });
        context = assembleRankedContext({ candidates: reranked.candidates });
        await input.repository.recordRetrievalResults({
          actor: request.actor,
          candidates: reranked.candidates,
          retrievalRunId: retrievalRun.id,
        });
      } catch (error) {
        await input.repository.completeRetrievalRun({
          actor: request.actor,
          errorCode: getRetrievalRunFailureCode(error),
          errorMessage: getRetrievalRunFailureMessage(error),
          retrievalRunId: retrievalRun.id,
          status: "failed",
        });
        throw error;
      }
      await input.repository.completeRetrievalRun({
        actor: request.actor,
        retrievalRunId: retrievalRun.id,
        status: "completed",
      });
      const assistantMessage =
        context.citations.length === 0
          ? await appendNoAnswer({
              knowledgeBaseId: request.body.knowledgeBaseId,
              repository: input.repository,
              retrievalRunId: retrievalRun.id,
              sessionId: session.id,
              actor: request.actor,
            })
          : await appendGroundedAnswer({
              answerGenerator: input.answerGenerator,
              candidates: reranked.candidates,
              contextText: context.items.map((item) => item.content).join("\n\n"),
              groundingLabel: reranked.fallbackUsed ? "依据有限" : "依据充分",
              history,
              knowledgeBaseId: request.body.knowledgeBaseId,
              question,
              repository: input.repository,
              requestId: request.requestId,
              retrievalRunId: retrievalRun.id,
              sessionId: session.id,
              tenantId: request.actor.tenant.id,
              actor: request.actor,
            });

      return {
        ok: true,
        result: {
          assistantMessage,
          session: {
            ...session,
            messageCount: session.messageCount + 2,
            updatedAt: assistantMessage.createdAt,
          },
          userMessage,
        },
      };
    },
    async *streamQuestion(request) {
      const question = request.body.question.trim();
      const requestId = request.requestId;
      let retrievalRunId: string | null = null;
      let retrievalCompleted = false;

      assertNotAborted(request.signal);

      const access = await input.repository.authorizeKnowledgeBase({
        actor: request.actor,
        knowledgeBaseId: request.body.knowledgeBaseId,
      });
      if (!access) {
        throw forbiddenKnowledgeBase();
      }

      assertNotAborted(request.signal);

      const session =
        request.body.sessionId === null
          ? await input.repository.createSession({
              actor: request.actor,
              knowledgeBaseId: request.body.knowledgeBaseId,
              title: createSessionTitle(question),
            })
          : await input.repository.getSession({
              actor: request.actor,
              knowledgeBaseId: request.body.knowledgeBaseId,
              sessionId: request.body.sessionId,
            });
      if (session === null) {
        throw chatResourceNotFound();
      }

      yield {
        event: "session",
        data: {
          requestId,
          session,
        },
      } satisfies ChatStreamEvent;

      assertNotAborted(request.signal);

      const userMessage = await input.repository.appendMessage({
        actor: request.actor,
        content: question,
        groundingLabel: null,
        knowledgeBaseId: request.body.knowledgeBaseId,
        retrievalRunId: null,
        role: "user",
        sessionId: session.id,
      });

      yield {
        event: "user_message",
        data: {
          requestId,
          sessionId: session.id,
          userMessage,
        },
      } satisfies ChatStreamEvent;

      assertNotAborted(request.signal);

      const retrievalRun = await input.repository.startRetrievalRun({
        actor: request.actor,
        knowledgeBaseId: request.body.knowledgeBaseId,
        messageId: userMessage.id,
        query: question,
        requestId,
        sessionId: session.id,
      });
      retrievalRunId = retrievalRun.id;

      yield {
        event: "retrieval_started",
        data: {
          requestId,
          retrievalRunId,
          sessionId: session.id,
          userMessageId: userMessage.id,
        },
      } satisfies ChatStreamEvent;

      const history = await input.repository.listRecentMessages({
        actor: request.actor,
        limit: ragRetrievalDefaults.recentHistoryLimit,
        sessionId: session.id,
      });

      let reranked: Awaited<ReturnType<typeof rankCandidates>>;
      let context: ReturnType<typeof assembleRankedContext>;
      try {
        assertNotAborted(request.signal);
        const candidates = await retrieveCandidates({
          embeddingProvider: input.embeddingProvider,
          keywordSearcher: input.keywordSearcher,
          repository: input.repository,
          knowledgeBaseId: request.body.knowledgeBaseId,
          query: question,
          requestId,
          retrievalRunId,
          tenantId: request.actor.tenant.id,
        });
        assertNotAborted(request.signal);
        const fused = fuseRetrievalCandidates({
          fusedLimit: ragRetrievalDefaults.fusedTopK,
          keyword: candidates.keyword,
          vector: candidates.vector,
        });
        reranked = await rankCandidates({
          candidates: fused.map((candidate, index) => ({
            ...candidate,
            rank: index + 1,
          })),
          query: question,
          requestId,
          logger: input.logger,
          reranker: input.reranker,
          tenantId: request.actor.tenant.id,
        });
        assertNotAborted(request.signal);
        context = assembleRankedContext({ candidates: reranked.candidates });
        await input.repository.recordRetrievalResults({
          actor: request.actor,
          candidates: reranked.candidates,
          retrievalRunId,
        });
      } catch (error) {
        await failRunningRetrievalRun({
          actor: request.actor,
          error,
          repository: input.repository,
          retrievalCompleted,
          retrievalRunId,
          signal: request.signal,
        });

        if (isAbortSignalError(error, request.signal)) {
          return;
        }

        yield createStreamErrorEvent({
          code: getRetrievalRunFailureCode(error),
          message: getRetrievalRunFailureMessage(error),
          requestId,
          retrievalRunId,
          sessionId: session.id,
          userMessageId: userMessage.id,
        });
        return;
      }

      await input.repository.completeRetrievalRun({
        actor: request.actor,
        retrievalRunId,
        status: "completed",
      });
      retrievalCompleted = true;

      const groundingLabel: GroundingLabel =
        context.citations.length === 0
          ? "未找到依据"
          : reranked.fallbackUsed
            ? "依据有限"
            : "依据充分";

      yield {
        event: "retrieval_completed",
        data: {
          citationCount: context.citations.length,
          groundingLabel,
          requestId,
          retrievalRunId,
          sessionId: session.id,
          userMessageId: userMessage.id,
        },
      } satisfies ChatStreamEvent;

      if (context.citations.length === 0) {
        const assistantMessage = await appendNoAnswer({
          knowledgeBaseId: request.body.knowledgeBaseId,
          repository: input.repository,
          retrievalRunId,
          sessionId: session.id,
          actor: request.actor,
        });
        yield createAnswerCompletedEvent({
          assistantMessage,
          requestId,
          session,
        });
        return;
      }

      const answerGroundingLabel: "依据充分" | "依据有限" =
        reranked.fallbackUsed ? "依据有限" : "依据充分";
      const answerEvents = streamGroundedAnswer({
        actor: request.actor,
        answerGenerator: input.answerGenerator,
        candidates: reranked.candidates,
        contextText: context.items.map((item) => item.content).join("\n\n"),
        groundingLabel: answerGroundingLabel,
        history,
        knowledgeBaseId: request.body.knowledgeBaseId,
        question,
        repository: input.repository,
        requestId,
        retrievalRunId,
        session,
        signal: request.signal,
        tenantId: request.actor.tenant.id,
        userMessageId: userMessage.id,
      });

      for await (const event of answerEvents) {
        yield event;
      }
    },
  };
}

async function* streamGroundedAnswer(input: {
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
  session: ChatSessionSummary;
  signal: AbortSignal | undefined;
  tenantId: string;
  userMessageId: string;
}): AsyncIterable<ChatStreamEvent> {
  let answerText = "";
  let sentDelta = false;

  try {
    for await (const event of input.answerGenerator.stream({
      context: input.contextText,
      history: input.history,
      question: input.question,
      requestId: input.requestId,
      signal: input.signal,
      tenantId: input.tenantId,
    })) {
      assertNotAborted(input.signal);

      if (event.type === "delta") {
        if (event.text.length === 0) {
          continue;
        }
        sentDelta = true;
        answerText += event.text;
        yield {
          event: "answer_delta",
          data: {
            delta: event.text,
            requestId: input.requestId,
            retrievalRunId: input.retrievalRunId,
            sessionId: input.session.id,
            userMessageId: input.userMessageId,
          },
        } satisfies ChatStreamEvent;
        continue;
      }

      if (event.type === "error") {
        if (!sentDelta) {
          const assistantMessage = await appendProviderFallbackAnswer(input);
          yield createAnswerCompletedEvent({
            assistantMessage,
            requestId: input.requestId,
            session: input.session,
          });
          return;
        }

        yield createStreamErrorEvent({
          code: event.code,
          message: "模型服务暂时不可用，请稍后重试。",
          requestId: input.requestId,
          retrievalRunId: input.retrievalRunId,
          retryable: true,
          sessionId: input.session.id,
          userMessageId: input.userMessageId,
        });
        return;
      }

      if (event.type === "done") {
        break;
      }
    }
  } catch (error) {
    if (isAbortSignalError(error, input.signal)) {
      return;
    }

    if (!sentDelta) {
      const assistantMessage = await appendProviderFallbackAnswer(input);
      yield createAnswerCompletedEvent({
        assistantMessage,
        requestId: input.requestId,
        session: input.session,
      });
      return;
    }

    yield createStreamErrorEvent({
      code: "PROVIDER_UNAVAILABLE",
      message: "模型服务暂时不可用，请稍后重试。",
      requestId: input.requestId,
      retrievalRunId: input.retrievalRunId,
      retryable: true,
      sessionId: input.session.id,
      userMessageId: input.userMessageId,
    });
    return;
  }

  const assistantMessage = await input.repository.appendMessage({
    actor: input.actor,
    citations: input.candidates,
    content: answerText,
    groundingLabel: input.groundingLabel,
    knowledgeBaseId: input.knowledgeBaseId,
    retrievalRunId: input.retrievalRunId,
    role: "assistant",
    sessionId: input.session.id,
  });

  yield createAnswerCompletedEvent({
    assistantMessage,
    requestId: input.requestId,
    session: input.session,
  });
}

async function appendProviderFallbackAnswer(input: {
  actor: Parameters<RagChatRepository["appendMessage"]>[0]["actor"];
  candidates: RankedRetrievalCandidate[];
  groundingLabel: "依据充分" | "依据有限";
  knowledgeBaseId: string;
  repository: RagChatRepository;
  retrievalRunId: string;
  session: ChatSessionSummary;
}): Promise<ChatMessage> {
  return input.repository.appendMessage({
    actor: input.actor,
    citations: input.candidates,
    content: "模型服务暂时不可用，请稍后重试。",
    groundingLabel: input.groundingLabel,
    knowledgeBaseId: input.knowledgeBaseId,
    retrievalRunId: input.retrievalRunId,
    role: "assistant",
    sessionId: input.session.id,
  });
}

function createAnswerCompletedEvent(input: {
  assistantMessage: ChatMessage;
  requestId: string;
  session: ChatSessionSummary;
}): ChatStreamEvent {
  return {
    event: "answer_completed",
    data: {
      assistantMessage: input.assistantMessage,
      requestId: input.requestId,
      session: {
        ...input.session,
        messageCount: input.session.messageCount + 2,
        updatedAt: input.assistantMessage.createdAt,
      },
    },
  };
}

function createStreamErrorEvent(input: {
  code: string;
  message: string;
  requestId: string;
  assistantMessageId?: string;
  retrievalRunId?: string;
  retryable?: boolean;
  sessionId?: string;
  userMessageId?: string;
}): ChatStreamEvent {
  return {
    event: "error",
    data: {
      assistantMessageId: input.assistantMessageId,
      code: input.code,
      message: input.message,
      requestId: input.requestId,
      retrievalRunId: input.retrievalRunId,
      retryable: input.retryable,
      sessionId: input.sessionId,
      userMessageId: input.userMessageId,
    },
  };
}

async function failRunningRetrievalRun(input: {
  actor: Parameters<RagChatRepository["completeRetrievalRun"]>[0]["actor"];
  error: unknown;
  repository: RagChatRepository;
  retrievalCompleted: boolean;
  retrievalRunId: string | null;
  signal: AbortSignal | undefined;
}): Promise<void> {
  if (input.retrievalRunId === null || input.retrievalCompleted) {
    return;
  }

  const isAbort = isAbortSignalError(input.error, input.signal);
  await input.repository.completeRetrievalRun({
    actor: input.actor,
    errorCode: isAbort ? "client_aborted" : getRetrievalRunFailureCode(input.error),
    errorMessage: isAbort ? "请求已取消。" : getRetrievalRunFailureMessage(input.error),
    retrievalRunId: input.retrievalRunId,
    status: "failed",
  });
}

function assertNotAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new ChatStreamAbortError();
  }
}

function isAbortSignalError(error: unknown, signal: AbortSignal | undefined): boolean {
  if (signal?.aborted) {
    return true;
  }

  return error instanceof ChatStreamAbortError;
}

class ChatStreamAbortError extends Error {
  constructor() {
    super("Chat stream aborted.");
    this.name = "AbortError";
  }
}

function getRetrievalRunFailureCode(error: unknown): string {
  return isAppError(error) ? error.data.reason : "unexpected_error";
}

function getRetrievalRunFailureMessage(error: unknown): string {
  return isAppError(error) ? error.data.message : "检索失败，请稍后重试。";
}
