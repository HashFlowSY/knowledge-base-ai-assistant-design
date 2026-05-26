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
        return forbiddenKnowledgeBase();
      }

      const session = await input.repository.createSession({
        actor: request.actor,
        knowledgeBaseId: request.body.knowledgeBaseId,
        title: "新会话",
      });

      return { ok: true, result: { session } };
    },
    async listMessages(request) {
      const session = await input.repository.getSession({
        actor: request.actor,
        sessionId: request.sessionId,
      });
      if (session === null) {
        return chatResourceNotFound();
      }

      return {
        ok: true,
        result: await input.repository.listMessages(request),
      };
    },
    async listSessions(request) {
      if (request.query.knowledgeBaseId !== undefined) {
        const access = await input.repository.authorizeKnowledgeBase({
          actor: request.actor,
          knowledgeBaseId: request.query.knowledgeBaseId,
        });
        if (!access) {
          return forbiddenKnowledgeBase();
        }
      }

      return {
        ok: true,
        result: await input.repository.listSessions(request),
      };
    },
    async submitFeedback(request) {
      const canAccessMessage = await input.repository.canAccessMessage({
        actor: request.actor,
        messageId: request.messageId,
        role: "assistant",
      });
      if (!canAccessMessage) {
        return chatResourceNotFound();
      }

      return {
        ok: true,
        result: await input.repository.saveFeedback(request),
      };
    },
    async submitQuestion(request) {
      const question = request.body.question.trim();
      const access = await input.repository.authorizeKnowledgeBase({
        actor: request.actor,
        knowledgeBaseId: request.body.knowledgeBaseId,
      });
      if (!access) {
        return forbiddenKnowledgeBase();
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
        return chatResourceNotFound();
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
      const candidates = await retrieveCandidates({
        embeddingProvider: input.embeddingProvider,
        keywordSearcher: input.keywordSearcher,
        repository: input.repository,
        knowledgeBaseId: request.body.knowledgeBaseId,
        query: question,
        requestId: request.requestId,
        tenantId: request.actor.tenant.id,
      });
      const fused = fuseRetrievalCandidates({
        fusedLimit: ragRetrievalDefaults.fusedTopK,
        keyword: candidates.keyword,
        vector: candidates.vector,
      });
      const reranked = await rankCandidates({
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
      const context = assembleRankedContext({ candidates: reranked.candidates });
      await input.repository.recordRetrievalResults({
        actor: request.actor,
        candidates: reranked.candidates,
        retrievalRunId: retrievalRun.id,
      });
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
  };
}
