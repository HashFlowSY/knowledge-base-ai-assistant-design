import { and, eq, inArray, isNotNull, lte, or } from "drizzle-orm";

import { documents, documentSources, ingestionJobs } from "@kb/db";

import type {
  DrizzleIngestionRepositoryOptions,
  IngestionRecoveryRepository,
} from "../contracts/types";

export function createDrizzleRecoveryRepository(
  options: DrizzleIngestionRepositoryOptions,
): IngestionRecoveryRepository {
  return {
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
