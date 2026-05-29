import { and, desc, eq, inArray, isNull } from "drizzle-orm";

import { documents, documentSources, ingestionJobs } from "@kb/db";

import type { DocumentFileUploadResult } from "../../../schemas";
import type { KnowledgeDb } from "../../../service-queries";
import type {
  UploadInput,
  UploadResultRow,
  UploadResultWithoutDuplicate,
} from "../shared/types";

export async function findExistingUploadResult(
  db: KnowledgeDb,
  input: UploadInput,
): Promise<UploadResultWithoutDuplicate | null> {
  const rows = await selectUploadResultRows(db)
    .where(
      and(
        eq(documentSources.tenantId, input.actor.tenant.id),
        eq(documentSources.knowledgeBaseId, input.knowledgeBaseId),
        eq(documentSources.sourceType, "file"),
        eq(documentSources.sourceHash, input.checksum),
        inArray(documentSources.uploadStatus, ["pending_upload", "available"]),
        isNull(documents.deletedAt),
      ),
    )
    .orderBy(desc(ingestionJobs.createdAt))
    .limit(1);

  const row = rows[0];
  return row === undefined ? null : mapUploadResultRow(row);
}

export async function findUploadResultBySourceId(
  db: KnowledgeDb,
  input: { sourceId: string; tenantId: string },
): Promise<UploadResultWithoutDuplicate | null> {
  const rows = await selectUploadResultRows(db)
    .where(
      and(
        eq(documentSources.tenantId, input.tenantId),
        eq(documentSources.id, input.sourceId),
      ),
    )
    .limit(1);

  const row = rows[0];
  return row === undefined ? null : mapUploadResultRow(row);
}

function selectUploadResultRows(db: KnowledgeDb) {
  return db
    .select({
      documentCreatedAt: documents.createdAt,
      documentCurrentVersion: documents.currentVersion,
      documentId: documents.id,
      knowledgeBaseId: documents.knowledgeBaseId,
      documentStatus: documents.status,
      documentTitle: documents.title,
      documentUpdatedAt: documents.updatedAt,
      jobCreatedAt: ingestionJobs.createdAt,
      jobId: ingestionJobs.id,
      jobQueuedAt: ingestionJobs.queuedAt,
      jobSourceHash: ingestionJobs.sourceHash,
      jobStatus: ingestionJobs.status,
      jobUpdatedAt: ingestionJobs.updatedAt,
      sourceBucket: documentSources.bucket,
      sourceHash: documentSources.sourceHash,
      sourceId: documentSources.id,
      sourceMimeType: documentSources.mimeType,
      sourceObjectKey: documentSources.objectKey,
      sourceScanStatus: documentSources.scanStatus,
      sourceSizeBytes: documentSources.sizeBytes,
      sourceUploadedAt: documentSources.uploadedAt,
      sourceUploadStatus: documentSources.uploadStatus,
      sourceUri: documentSources.sourceUri,
    })
    .from(documentSources)
    .innerJoin(documents, eq(documents.id, documentSources.documentId))
    .innerJoin(
      ingestionJobs,
      and(
        eq(ingestionJobs.documentId, documents.id),
        eq(ingestionJobs.sourceHash, documentSources.sourceHash),
      ),
    );
}

function mapUploadResultRow(
  row: UploadResultRow,
): Omit<DocumentFileUploadResult, "duplicate"> {
  return {
    document: {
      createdAt: row.documentCreatedAt.toISOString(),
      currentVersion: row.documentCurrentVersion,
      id: row.documentId,
      knowledgeBaseId: row.knowledgeBaseId,
      status: row.documentStatus,
      title: row.documentTitle,
      updatedAt: row.documentUpdatedAt.toISOString(),
    },
    job: {
      createdAt: row.jobCreatedAt.toISOString(),
      documentId: row.documentId,
      id: row.jobId,
      knowledgeBaseId: row.knowledgeBaseId,
      queuedAt: row.jobQueuedAt.toISOString(),
      sourceHash: row.jobSourceHash ?? row.sourceHash,
      sourceType: "file",
      status: row.jobStatus,
      updatedAt: row.jobUpdatedAt.toISOString(),
    },
    source: {
      bucket: row.sourceBucket,
      documentId: row.documentId,
      id: row.sourceId,
      mimeType: row.sourceMimeType ?? "application/octet-stream",
      objectKey: row.sourceObjectKey ?? "",
      scanStatus: row.sourceScanStatus,
      sizeBytes: row.sourceSizeBytes ?? 0,
      sourceHash: row.sourceHash,
      sourceType: "file",
      sourceUri: row.sourceUri,
      uploadedAt: row.sourceUploadedAt?.toISOString() ?? null,
      uploadStatus: row.sourceUploadStatus,
    },
  };
}
