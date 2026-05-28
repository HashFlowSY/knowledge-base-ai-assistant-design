import { and, eq, inArray, isNotNull, lte, or, sql } from "drizzle-orm";

import {
  chunkEmbeddings,
  documentChunks,
  documents,
  documentSources,
  ingestionJobLogs,
  ingestionJobs,
} from "@kb/db";

import type {
  DrizzleIngestionRepositoryOptions,
  IngestionPipelineRepository,
  IngestionRecoveryRepository,
} from "../contracts/types";
import { parseDocumentVersion } from "./mappers";

export function createDrizzleIngestionRepository(
  options: DrizzleIngestionRepositoryOptions,
): IngestionPipelineRepository & IngestionRecoveryRepository {
  return {
    async claimFileJob(payload) {
      const documentVersion = parseDocumentVersion(payload.documentVersion);
      const rows = await options.db
        .update(ingestionJobs)
        .set({
          attempts: sql`${ingestionJobs.attempts} + 1`,
          currentStep: "source_connector",
          lastErrorCode: null,
          lastErrorMessage: null,
          startedAt: sql`COALESCE(${ingestionJobs.startedAt}, NOW())`,
          status: "running",
          updatedAt: sql`NOW()`,
        })
        .where(
          and(
            eq(ingestionJobs.id, payload.ingestionJobId),
            eq(ingestionJobs.tenantId, payload.tenantId),
            inArray(ingestionJobs.status, ["queued", "retrying"]),
          ),
        )
        .returning({ id: ingestionJobs.id });

      if (rows[0] === undefined) {
        return { status: "already_claimed" };
      }

      return {
        status: "claimed",
        context: {
          documentId: payload.documentId,
          documentVersion,
          ingestionJobId: payload.ingestionJobId,
          knowledgeBaseId: payload.knowledgeBaseId,
          requestedBy: payload.requestedBy,
          sourceObjectKey: payload.sourceObjectKey,
          tenantId: payload.tenantId,
        },
      };
    },
    async loadFileSource(context) {
      const rows = await options.db
        .select({
          bucket: documentSources.bucket,
          mimeType: documentSources.mimeType,
          objectKey: documentSources.objectKey,
          sourceUri: documentSources.sourceUri,
        })
        .from(documentSources)
        .where(
          and(
            eq(documentSources.tenantId, context.tenantId),
            eq(documentSources.documentId, context.documentId),
            eq(documentSources.objectKey, context.sourceObjectKey),
            eq(documentSources.uploadStatus, "available"),
          ),
        )
        .limit(1);
      const source = rows[0];
      if (source === undefined || source.objectKey === null) {
        throw new Error("Ingestion source object is not available.");
      }

      const object = await options.objectStorage.getObject({
        bucket: source.bucket,
        key: source.objectKey,
      });

      return {
        body: object.body,
        mimeType:
          source.mimeType ?? object.contentType ?? "application/octet-stream",
        originalFilename: source.sourceUri,
      };
    },
    async recordStep(input) {
      await options.db.transaction(async (tx) => {
        await tx.insert(ingestionJobLogs).values({
          ...(input.errorCode === undefined ? {} : { errorCode: input.errorCode }),
          jobId: input.ingestionJobId,
          level: input.status === "failed" ? "error" : "info",
          message: input.message,
          metadata: input.metadata,
          step: input.step,
          tenantId: input.tenantId,
        });

        await tx
          .update(ingestionJobs)
          .set({
            currentStep: input.step,
            updatedAt: sql`NOW()`,
          })
          .where(eq(ingestionJobs.id, input.ingestionJobId));
      });
    },
    async persistIngestionOutput(input) {
      await options.db.transaction(async (tx) => {
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
          return;
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
      });
    },
    async completeJob(input) {
      await options.db.transaction(async (tx) => {
        await tx
          .update(ingestionJobs)
          .set({
            currentStep: "index_writer",
            finishedAt: sql`NOW()`,
            lastErrorCode: null,
            lastErrorMessage: null,
            status: "completed",
            updatedAt: sql`NOW()`,
          })
          .where(eq(ingestionJobs.id, input.ingestionJobId));

        const rows = await tx
          .select({ documentId: ingestionJobs.documentId })
          .from(ingestionJobs)
          .where(eq(ingestionJobs.id, input.ingestionJobId))
          .limit(1);
        const row = rows[0];
        if (row !== undefined) {
          await tx
            .update(documents)
            .set({
              status: "ready",
              updatedAt: sql`NOW()`,
            })
            .where(
              and(
                eq(documents.id, row.documentId),
                eq(documents.currentVersion, input.documentVersion),
              ),
            );
        }
      });
    },
    async failJob(input) {
      await options.db.transaction(async (tx) => {
        await tx
          .update(ingestionJobs)
          .set({
            finishedAt: input.retryable ? null : sql`NOW()`,
            lastErrorCode: input.errorCode,
            lastErrorMessage: input.errorMessage,
            status: input.retryable ? "retrying" : "failed",
            updatedAt: sql`NOW()`,
          })
          .where(eq(ingestionJobs.id, input.ingestionJobId));

        const rows = await tx
          .select({ documentId: ingestionJobs.documentId })
          .from(ingestionJobs)
          .where(eq(ingestionJobs.id, input.ingestionJobId))
          .limit(1);
        const row = rows[0];
        if (row !== undefined) {
          await tx
            .update(documents)
            .set({
              status: "failed",
              updatedAt: sql`NOW()`,
            })
            .where(
              and(
                eq(documents.id, row.documentId),
                eq(documents.currentVersion, input.documentVersion),
              ),
            );
        }
      });
    },
    async listRecoverableFileJobs(input) {
      const rows = await options.db
        .select({
          documentId: ingestionJobs.documentId,
          documentVersion: documents.currentVersion,
          ingestionJobId: ingestionJobs.id,
          knowledgeBaseId: ingestionJobs.knowledgeBaseId,
          objectKey: documentSources.objectKey,
          requestedByUserId: ingestionJobs.requestedByUserId,
          tenantId: ingestionJobs.tenantId,
        })
        .from(ingestionJobs)
        .innerJoin(
          documents,
          and(
            eq(documents.tenantId, ingestionJobs.tenantId),
            eq(documents.id, ingestionJobs.documentId),
          ),
        )
        .innerJoin(
          documentSources,
          and(
            eq(documentSources.tenantId, ingestionJobs.tenantId),
            eq(documentSources.documentId, ingestionJobs.documentId),
            eq(documentSources.sourceHash, ingestionJobs.sourceHash),
            eq(documentSources.uploadStatus, "available"),
            isNotNull(documentSources.objectKey),
          ),
        )
        .where(
          and(
            eq(ingestionJobs.sourceType, "file"),
            lte(ingestionJobs.updatedAt, input.updatedBefore),
            or(
              inArray(ingestionJobs.status, ["queued", "retrying"]),
              and(
                eq(ingestionJobs.status, "failed"),
                eq(ingestionJobs.lastErrorCode, "QUEUE_ENQUEUE_FAILED"),
              ),
            ),
          ),
        )
        .limit(input.limit);

      return rows.map((row) => ({
        type: "file_ingestion" as const,
        documentId: row.documentId,
        documentVersion: row.documentVersion.toString(),
        ingestionJobId: row.ingestionJobId,
        knowledgeBaseId: row.knowledgeBaseId,
        requestedBy: row.requestedByUserId ?? "system",
        sourceObjectKey: row.objectKey ?? "",
        tenantId: row.tenantId,
      }));
    },
  };
}
