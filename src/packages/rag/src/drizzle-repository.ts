import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";

import {
  chatMessages,
  chatSessions,
  type ProjectDb,
} from "@kb/db";

import { saveAnswerFeedback } from "./drizzle-feedback";
import {
  createMessageMetadata,
  hydrateMessages,
  insertCitations,
  mapMessage,
  mapSession,
} from "./drizzle-records";
import {
  actorCanAccessKnowledgeBase,
  completeRetrievalRun as completeStoredRetrievalRun,
  recordRetrievalResults as recordStoredRetrievalResults,
  startRetrievalRun as startStoredRetrievalRun,
} from "./drizzle-runs";
import { vectorSearchChunks } from "./drizzle-vector";
import type { RagChatRepository } from "./service-types";

export function createDrizzleRagChatRepository(db: ProjectDb): RagChatRepository {
  return {
    async appendMessage(input) {
      return db.transaction(async (tx) => {
        const sessionRows = await tx
          .select({ id: chatSessions.id })
          .from(chatSessions)
          .where(
            and(
              eq(chatSessions.tenantId, input.actor.tenant.id),
              eq(chatSessions.id, input.sessionId),
              eq(chatSessions.userId, input.actor.user.id),
              isNull(chatSessions.deletedAt),
              selectedKnowledgeBaseContains(input.knowledgeBaseId),
            ),
          )
          .limit(1);
        if (sessionRows[0] === undefined) {
          throw new Error("Chat session is not accessible.");
        }

        const sequenceRows = await tx
          .select({
            next: sql<number>`coalesce(max(${chatMessages.sequence}), 0) + 1`,
          })
          .from(chatMessages)
          .where(eq(chatMessages.sessionId, input.sessionId));
        const sequence = sequenceRows[0]?.next ?? 1;
        const messageRows = await tx
          .insert(chatMessages)
          .values({
            content: input.content,
            metadata: createMessageMetadata({
              groundingLabel: input.groundingLabel,
              retrievalRunId: input.retrievalRunId,
            }),
            role: input.role,
            sequence,
            sessionId: input.sessionId,
            tenantId: input.actor.tenant.id,
          })
          .returning();
        const message = messageRows[0];
        if (message === undefined) {
          throw new Error("Chat message insert failed.");
        }

        await tx
          .update(chatSessions)
          .set({ updatedAt: sql`NOW()` })
          .where(eq(chatSessions.id, input.sessionId));

        const citations =
          input.role === "assistant" && input.citations !== undefined
            ? await insertCitations(tx, {
                candidates: input.citations,
                messageId: message.id,
                retrievalRunId: input.retrievalRunId,
                tenantId: input.actor.tenant.id,
              })
            : [];

        return mapMessage(message, citations, null);
      });
    },
    authorizeKnowledgeBase(input) {
      return actorCanAccessKnowledgeBase(db, input);
    },
    completeRetrievalRun(input) {
      return completeStoredRetrievalRun(db, input);
    },
    async createSession(input) {
      const rows = await db
        .insert(chatSessions)
        .values({
          metadata: {},
          selectedKnowledgeBaseIds: [input.knowledgeBaseId],
          tenantId: input.actor.tenant.id,
          title: input.title,
          userId: input.actor.user.id,
        })
        .returning();
      const row = rows[0];
      if (row === undefined) {
        throw new Error("Chat session insert failed.");
      }

      return mapSession(row, 0);
    },
    async canAccessMessage(input) {
      const conditions = [
        eq(chatMessages.tenantId, input.actor.tenant.id),
        eq(chatMessages.id, input.messageId),
        eq(chatSessions.userId, input.actor.user.id),
        isNull(chatSessions.deletedAt),
      ];
      if (input.role !== undefined) {
        conditions.push(eq(chatMessages.role, input.role));
      }

      const rows = await db
        .select({ id: chatMessages.id })
        .from(chatMessages)
        .innerJoin(
          chatSessions,
          and(
            eq(chatSessions.tenantId, chatMessages.tenantId),
            eq(chatSessions.id, chatMessages.sessionId),
          ),
        )
        .where(and(...conditions))
        .limit(1);

      return rows[0] !== undefined;
    },
    async getSession(input) {
      const conditions = [
        eq(chatSessions.tenantId, input.actor.tenant.id),
        eq(chatSessions.id, input.sessionId),
        eq(chatSessions.userId, input.actor.user.id),
        isNull(chatSessions.deletedAt),
      ];
      if (input.knowledgeBaseId !== undefined) {
        conditions.push(selectedKnowledgeBaseContains(input.knowledgeBaseId));
      }

      const rows = await db
        .select({
          session: chatSessions,
          messageCount: sql<number>`count(${chatMessages.id})`,
        })
        .from(chatSessions)
        .leftJoin(
          chatMessages,
          and(
            eq(chatMessages.tenantId, chatSessions.tenantId),
            eq(chatMessages.sessionId, chatSessions.id),
          ),
        )
        .where(and(...conditions))
        .groupBy(chatSessions.id)
        .limit(1);

      const row = rows[0];
      return row === undefined ? null : mapSession(row.session, row.messageCount);
    },
    async listMessages(input) {
      const rows = await db
        .select({ message: chatMessages })
        .from(chatMessages)
        .innerJoin(
          chatSessions,
          and(
            eq(chatSessions.tenantId, chatMessages.tenantId),
            eq(chatSessions.id, chatMessages.sessionId),
          ),
        )
        .where(
          and(
            eq(chatMessages.tenantId, input.actor.tenant.id),
            eq(chatMessages.sessionId, input.sessionId),
            eq(chatSessions.userId, input.actor.user.id),
            isNull(chatSessions.deletedAt),
          ),
        )
        .orderBy(asc(chatMessages.sequence));

      return { messages: await hydrateMessages(db, rows.map((row) => row.message)) };
    },
    async listRecentMessages(input) {
      const rows = await db
        .select({ message: chatMessages })
        .from(chatMessages)
        .innerJoin(
          chatSessions,
          and(
            eq(chatSessions.tenantId, chatMessages.tenantId),
            eq(chatSessions.id, chatMessages.sessionId),
          ),
        )
        .where(
          and(
            eq(chatMessages.tenantId, input.actor.tenant.id),
            eq(chatMessages.sessionId, input.sessionId),
            eq(chatSessions.userId, input.actor.user.id),
            isNull(chatSessions.deletedAt),
          ),
        )
        .orderBy(desc(chatMessages.sequence))
        .limit(input.limit);

      return (await hydrateMessages(db, rows.map((row) => row.message))).reverse();
    },
    async listSessions(input) {
      const conditions = [
        eq(chatSessions.tenantId, input.actor.tenant.id),
        eq(chatSessions.userId, input.actor.user.id),
        isNull(chatSessions.deletedAt),
      ];
      if (input.query.knowledgeBaseId !== undefined) {
        conditions.push(selectedKnowledgeBaseContains(input.query.knowledgeBaseId));
      }

      const rows = await db
        .select({
          session: chatSessions,
          messageCount: sql<number>`count(${chatMessages.id})`,
        })
        .from(chatSessions)
        .leftJoin(
          chatMessages,
          and(
            eq(chatMessages.tenantId, chatSessions.tenantId),
            eq(chatMessages.sessionId, chatSessions.id),
          ),
        )
        .where(and(...conditions))
        .groupBy(chatSessions.id)
        .orderBy(desc(chatSessions.updatedAt))
        .limit(50);

      return {
        sessions: rows.map((row) => mapSession(row.session, row.messageCount)),
      };
    },
    saveFeedback(input) {
      return saveAnswerFeedback(db, input);
    },
    recordRetrievalResults(input) {
      return recordStoredRetrievalResults(db, input);
    },
    startRetrievalRun(input) {
      return startStoredRetrievalRun(db, input);
    },
    vectorSearch(input) {
      return vectorSearchChunks(db, input);
    },
  };
}

function selectedKnowledgeBaseContains(knowledgeBaseId: string) {
  return sql`${chatSessions.selectedKnowledgeBaseIds} @> ${JSON.stringify([
    knowledgeBaseId,
  ])}::jsonb`;
}
