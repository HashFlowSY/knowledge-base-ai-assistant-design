import { and, eq } from "drizzle-orm";

import {
  answerFeedback,
  answerFeedbackCitations,
  chatMessages,
  chatSessions,
  type ProjectDb,
} from "@kb/db";

import { createAccessibleChatSessionConditions } from "./drizzle-chat-access";
import { mapFeedback, readRetrievalRunId } from "./drizzle-records";
import type { RagChatRepository } from "./service-types";

export async function saveAnswerFeedback(
  db: ProjectDb,
  input: Parameters<RagChatRepository["saveFeedback"]>[0],
): ReturnType<RagChatRepository["saveFeedback"]> {
  return db.transaction(async (tx) => {
    const messageRows = await tx
      .select({ metadata: chatMessages.metadata })
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
          eq(chatMessages.id, input.messageId),
          eq(chatMessages.role, "assistant"),
          ...createAccessibleChatSessionConditions({ actor: input.actor }),
        ),
      )
      .limit(1);
    const message = messageRows[0];
    if (message === undefined) {
      return null;
    }

    const retrievalRunId = readRetrievalRunId(message.metadata);
    const rows = await tx
      .insert(answerFeedback)
      .values({
        actorId: input.actor.user.id,
        messageId: input.messageId,
        rating: input.body.rating,
        reason: input.body.reason,
        retrievalRunId,
        tenantId: input.actor.tenant.id,
      })
      .returning();
    const row = rows[0];
    if (row === undefined) {
      throw new Error("Answer feedback insert failed.");
    }
    if (input.body.citationIds.length > 0) {
      await tx.insert(answerFeedbackCitations).values(
        input.body.citationIds.map((citationId) => ({
          citationId,
          feedbackId: row.id,
          tenantId: input.actor.tenant.id,
        })),
      );
    }

    return { feedback: mapFeedback(row) };
  });
}
