import { and, eq, isNull, sql } from "drizzle-orm";

import {
  chunkEmbeddings,
  documentChunks,
  documents,
  type ProjectDb,
} from "@kb/db";

import type { RagChatRepository } from "./service-types";

export async function vectorSearchChunks(
  db: ProjectDb,
  input: Parameters<RagChatRepository["vectorSearch"]>[0],
): ReturnType<RagChatRepository["vectorSearch"]> {
  const vectorLiteral = `[${input.vector.join(",")}]`;
  const rows = await db
    .select({
      chunkId: documentChunks.id,
      chunkIndex: documentChunks.chunkIndex,
      content: documentChunks.content,
      documentId: documentChunks.documentId,
      documentTitle: documents.title,
      knowledgeBaseId: documentChunks.knowledgeBaseId,
      metadata: documentChunks.metadata,
      score: sql<number>`1 - (${chunkEmbeddings.embedding} <=> ${vectorLiteral}::vector)`,
      sourceLocator: documentChunks.sourceLocator,
      sourceUri: documents.id,
      tokenEstimate: documentChunks.tokenEstimate,
    })
    .from(chunkEmbeddings)
    .innerJoin(documentChunks, eq(documentChunks.id, chunkEmbeddings.chunkId))
    .innerJoin(documents, eq(documents.id, documentChunks.documentId))
    .where(
      and(
        eq(chunkEmbeddings.tenantId, input.tenantId),
        eq(chunkEmbeddings.knowledgeBaseId, input.knowledgeBaseId),
        eq(documents.status, "ready"),
        isNull(documents.deletedAt),
      ),
    )
    .orderBy(sql`${chunkEmbeddings.embedding} <=> ${vectorLiteral}::vector`)
    .limit(input.limit);

  return rows.map((row) => ({ ...row, metadata: row.metadata ?? {} }));
}
