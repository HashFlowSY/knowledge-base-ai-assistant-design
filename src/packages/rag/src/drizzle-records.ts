import { and, asc, eq, inArray } from "drizzle-orm";

import {
  answerCitations,
  answerFeedback,
  type ProjectDb,
  type chatMessages,
  type chatSessions,
} from "@kb/db";

import type {
  ChatCitation,
  ChatFeedback,
  ChatMessage,
  ChatSessionSummary,
  GroundingLabel,
  RankedRetrievalCandidate,
} from "./types";
import { groupBy } from "./collection";

export type RagDbTransaction = Parameters<
  Parameters<ProjectDb["transaction"]>[0]
>[0];

export function createMessageMetadata(input: {
  groundingLabel: GroundingLabel | null;
  retrievalRunId: string | null;
}): Record<string, unknown> {
  return {
    ...(input.groundingLabel === null
      ? {}
      : { groundingLabel: input.groundingLabel }),
    ...(input.retrievalRunId === null
      ? {}
      : { retrievalRunId: input.retrievalRunId }),
  };
}

export async function hydrateMessages(
  db: ProjectDb,
  rows: (typeof chatMessages.$inferSelect)[],
): Promise<ChatMessage[]> {
  const messageIds = rows.map((row) => row.id);
  if (messageIds.length === 0) {
    return [];
  }
  const tenantId = rows[0]?.tenantId;
  if (tenantId === undefined) {
    return [];
  }

  const [citationRows, feedbackRows] = await Promise.all([
    db
      .select()
      .from(answerCitations)
      .where(
        and(
          eq(answerCitations.tenantId, tenantId),
          inArray(answerCitations.messageId, messageIds),
        ),
      )
      .orderBy(asc(answerCitations.rank)),
    db
      .select()
      .from(answerFeedback)
      .where(
        and(
          eq(answerFeedback.tenantId, tenantId),
          inArray(answerFeedback.messageId, messageIds),
        ),
      ),
  ]);
  const citationsByMessage = groupBy(citationRows, (row) => row.messageId);
  const feedbackByMessage = new Map(
    feedbackRows.map((row) => [row.messageId, mapFeedback(row)]),
  );

  return rows.map((row) =>
    mapMessage(
      row,
      (citationsByMessage.get(row.id) ?? []).map(mapCitation),
      feedbackByMessage.get(row.id) ?? null,
    ),
  );
}

export async function insertCitations(
  tx: RagDbTransaction,
  input: {
    candidates: RankedRetrievalCandidate[];
    messageId: string;
    retrievalRunId: string | null;
    tenantId: string;
  },
): Promise<ChatCitation[]> {
  if (input.candidates.length === 0) {
    return [];
  }

  const rows = await tx
    .insert(answerCitations)
    .values(
      input.candidates.map((candidate, index) => ({
        chunkId: candidate.chunkId,
        documentId: candidate.documentId,
        knowledgeBaseId: candidate.knowledgeBaseId,
        messageId: input.messageId,
        rank: index + 1,
        retrievalRunId: input.retrievalRunId,
        snippet: candidate.content.slice(0, 240),
        sourceLocator: candidate.sourceLocator,
        sourceTitle: candidate.documentTitle,
        sourceUri: candidate.sourceUri,
        tenantId: input.tenantId,
      })),
    )
    .returning();

  return rows.map(mapCitation);
}

export function mapSession(
  row: typeof chatSessions.$inferSelect,
  messageCount: number,
): ChatSessionSummary {
  return {
    createdAt: row.createdAt.toISOString(),
    id: row.id,
    knowledgeBaseId: row.selectedKnowledgeBaseIds[0] ?? "",
    messageCount,
    title: row.title ?? "新会话",
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function mapMessage(
  row: typeof chatMessages.$inferSelect,
  citations: ChatCitation[],
  feedback: ChatFeedback | null,
): ChatMessage {
  return {
    citations,
    content: row.content,
    createdAt: row.createdAt.toISOString(),
    feedback,
    groundingLabel: readGroundingLabel(row.metadata),
    id: row.id,
    retrievalRunId: readRetrievalRunId(row.metadata),
    role: row.role === "assistant" ? "assistant" : "user",
    sequence: row.sequence,
    sessionId: row.sessionId,
  };
}

function mapCitation(row: typeof answerCitations.$inferSelect): ChatCitation {
  return {
    chunkId: row.chunkId,
    documentId: row.documentId,
    id: row.id,
    knowledgeBaseId: row.knowledgeBaseId,
    messageId: row.messageId,
    rank: row.rank,
    retrievalRunId: row.retrievalRunId,
    snippet: row.snippet,
    sourceLocator: row.sourceLocator,
    sourceTitle: row.sourceTitle,
    sourceUri: row.sourceUri,
  };
}

export function mapFeedback(row: typeof answerFeedback.$inferSelect): ChatFeedback {
  return {
    createdAt: row.createdAt.toISOString(),
    id: row.id,
    rating: row.rating,
    reason: row.reason,
  };
}

function readGroundingLabel(
  metadata: Record<string, unknown>,
): ChatMessage["groundingLabel"] {
  const label = metadata.groundingLabel;
  return label === "依据充分" || label === "依据有限" || label === "未找到依据"
    ? label
    : null;
}

export function readRetrievalRunId(metadata: Record<string, unknown>): string | null {
  return typeof metadata.retrievalRunId === "string" ? metadata.retrievalRunId : null;
}
