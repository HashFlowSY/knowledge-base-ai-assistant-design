import { and, eq, isNull, sql } from "drizzle-orm";

import {
  knowledgeBaseMembers,
  knowledgeBases,
  retrievalResults,
  retrievalRuns,
  type ProjectDb,
} from "@kb/db";

import type { RankedRetrievalCandidate } from "./types";
import type { RagActor } from "./service-types";

export async function actorCanAccessKnowledgeBase(
  db: ProjectDb,
  input: { actor: RagActor; knowledgeBaseId: string },
): Promise<boolean> {
  const conditions = [
    eq(knowledgeBases.tenantId, input.actor.tenant.id),
    eq(knowledgeBases.id, input.knowledgeBaseId),
    isNull(knowledgeBases.deletedAt),
  ];

  if (input.actor.role === "member") {
    conditions.push(
      sql`exists (
        select 1
        from ${knowledgeBaseMembers}
        where ${knowledgeBaseMembers.tenantId} = ${knowledgeBases.tenantId}
          and ${knowledgeBaseMembers.knowledgeBaseId} = ${knowledgeBases.id}
          and ${knowledgeBaseMembers.userId} = ${input.actor.user.id}
      )`,
    );
  }

  const rows = await db
    .select({ id: knowledgeBases.id })
    .from(knowledgeBases)
    .where(and(...conditions))
    .limit(1);

  return rows[0] !== undefined;
}

export async function startRetrievalRun(
  db: ProjectDb,
  input: {
    actor: RagActor;
    knowledgeBaseId: string;
    messageId: string;
    query: string;
    requestId: string;
    sessionId: string;
  },
): Promise<{ id: string }> {
  const rows = await db
    .insert(retrievalRuns)
    .values({
      messageId: input.messageId,
      metadata: { requestId: input.requestId },
      query: input.query,
      selectedKnowledgeBaseIds: [input.knowledgeBaseId],
      sessionId: input.sessionId,
      status: "running",
      tenantId: input.actor.tenant.id,
    })
    .returning({ id: retrievalRuns.id });
  const row = rows[0];
  if (row === undefined) {
    throw new Error("Retrieval run insert failed.");
  }

  return row;
}

export async function recordRetrievalResults(
  db: ProjectDb,
  input: {
    actor: RagActor;
    candidates: RankedRetrievalCandidate[];
    retrievalRunId: string;
  },
): Promise<void> {
  if (input.candidates.length === 0) {
    return;
  }

  await db.insert(retrievalResults).values(
    input.candidates.map((candidate) => ({
      chunkId: candidate.chunkId,
      documentId: candidate.documentId,
      fusedScore: toRequiredScore(candidate.fusedScore),
      keywordScore: toOptionalScore(candidate.keywordScore),
      knowledgeBaseId: candidate.knowledgeBaseId,
      metadata: {
        chunkIndex: candidate.chunkIndex,
        keywordRank: candidate.keywordRank ?? null,
        tokenEstimate: candidate.tokenEstimate,
        vectorRank: candidate.vectorRank ?? null,
      },
      rank: candidate.rank,
      rerankScore: toOptionalScore(candidate.rerankScore),
      runId: input.retrievalRunId,
      source: candidate.source,
      tenantId: input.actor.tenant.id,
      vectorScore: toOptionalScore(candidate.vectorScore),
    })),
  );
}

export async function completeRetrievalRun(
  db: ProjectDb,
  input: {
    actor: RagActor;
    errorCode?: string;
    errorMessage?: string;
    retrievalRunId: string;
    status: "completed" | "failed";
  },
): Promise<void> {
  await db
    .update(retrievalRuns)
    .set({
      errorCode: input.errorCode ?? null,
      errorMessage: input.errorMessage ?? null,
      finishedAt: sql`NOW()`,
      status: input.status,
    })
    .where(
      and(
        eq(retrievalRuns.tenantId, input.actor.tenant.id),
        eq(retrievalRuns.id, input.retrievalRunId),
      ),
    );
}

function toOptionalScore(value: number | undefined): string | null {
  return value === undefined || !Number.isFinite(value) ? null : value.toFixed(8);
}

function toRequiredScore(value: number): string {
  return Number.isFinite(value) ? value.toFixed(8) : "0.00000000";
}
