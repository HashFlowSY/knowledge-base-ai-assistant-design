import { and, eq, inArray } from "drizzle-orm";

import { chunkEmbeddings, documentChunks } from "@kb/db";

import type {
  DrizzleIngestionRepositoryOptions,
  IngestionPipelineRepository,
} from "../contracts/types";

type DrizzleIngestionOutputRepository = Pick<
  IngestionPipelineRepository,
  "persistIngestionOutput"
>;

export function createDrizzleIngestionOutputRepository(
  options: DrizzleIngestionRepositoryOptions,
): DrizzleIngestionOutputRepository {
  return {
    async persistIngestionOutput(input) {
      return options.db.transaction(async (tx) => {
        const existingChunks = await tx
          .select({ id: documentChunks.id })
          .from(documentChunks)
          .where(
            and(
              eq(documentChunks.tenantId, input.context.tenantId),
              eq(documentChunks.documentId, input.context.documentId),
              eq(documentChunks.documentVersion, input.context.documentVersion),
            ),
          );
        const existingChunkIds = existingChunks.map((chunk) => chunk.id);
        if (existingChunkIds.length > 0) {
          await tx
            .delete(chunkEmbeddings)
            .where(inArray(chunkEmbeddings.chunkId, existingChunkIds));
        }

        await tx
          .delete(documentChunks)
          .where(
            and(
              eq(documentChunks.tenantId, input.context.tenantId),
              eq(documentChunks.documentId, input.context.documentId),
              eq(documentChunks.documentVersion, input.context.documentVersion),
            ),
          );

        if (input.chunks.length === 0) {
          return { chunks: [] };
        }

        const insertedChunks = await tx
          .insert(documentChunks)
          .values(
            input.chunks.map((chunk) => ({
              chunkIndex: chunk.chunkIndex,
              content: chunk.content,
              contentHash: chunk.contentHash,
              documentId: input.context.documentId,
              documentVersion: input.context.documentVersion,
              knowledgeBaseId: input.context.knowledgeBaseId,
              metadata: chunk.metadata,
              sourceLocator: chunk.sourceLocator,
              tenantId: input.context.tenantId,
              tokenEstimate: chunk.tokenEstimate,
            })),
          )
          .returning({
            chunkIndex: documentChunks.chunkIndex,
            id: documentChunks.id,
          });
        const chunkIdByIndex = new Map(
          insertedChunks.map((chunk) => [chunk.chunkIndex, chunk.id]),
        );

        await tx.insert(chunkEmbeddings).values(
          input.embeddings.map((embedding) => {
            const chunkId = chunkIdByIndex.get(embedding.chunkIndex);
            if (chunkId === undefined) {
              throw new Error("Chunk insert result missing for embedding.");
            }

            return {
              chunkId,
              contentHash: embedding.contentHash,
              dimensions: embedding.dimensions,
              documentId: input.context.documentId,
              embedding: embedding.embedding,
              knowledgeBaseId: input.context.knowledgeBaseId,
              modelId: embedding.modelId,
              providerId: embedding.providerId,
              tenantId: input.context.tenantId,
            };
          }),
        );

        return { chunks: insertedChunks };
      });
    },
  };
}
