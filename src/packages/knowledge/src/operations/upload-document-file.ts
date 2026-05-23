import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import {
  auditLogs,
  documents,
  documentSources,
  ingestionJobs,
  type ProjectDb,
} from "@kb/db";
import {
  createDocumentObjectKey,
  type ObjectStorageClient,
} from "@kb/storage";

import {
  createForbiddenError,
  createInternalError,
  createNotFoundError,
  fromServiceException,
} from "../service-errors";
import {
  actorIsKnowledgeBaseMember,
  findTenantKnowledgeBaseRow,
  type KnowledgeDb,
} from "../service-queries";
import type {
  KnowledgeBaseService,
  KnowledgeBaseServiceOptions,
} from "../service-types";
import type { DocumentFileUploadResult } from "../schemas";

const documentVersion = 1;
const objectUploadFailedCode = "OBJECT_UPLOAD_FAILED";
const finalizationFailedCode = "UPLOAD_FINALIZATION_FAILED";
const objectCleanupFailedCode = "OBJECT_CLEANUP_FAILED";

type UploadInput = Parameters<KnowledgeBaseService["uploadDocumentFile"]>[0];
type UploadResult = Awaited<ReturnType<KnowledgeBaseService["uploadDocumentFile"]>>;
type UploadServiceError = Extract<UploadResult, { ok: false }>;

interface ReservedUpload {
  documentId: string;
  jobId: string;
  objectKey: string;
  sourceId: string;
}

interface UploadResultRow {
  documentCreatedAt: Date;
  documentCurrentVersion: number;
  documentId: string;
  knowledgeBaseId: string;
  documentStatus: "pending" | "processing" | "ready" | "failed" | "archived";
  documentTitle: string;
  documentUpdatedAt: Date;
  jobCreatedAt: Date;
  jobId: string;
  jobQueuedAt: Date;
  jobSourceHash: string | null;
  jobStatus:
    | "pending_source"
    | "queued"
    | "running"
    | "retrying"
    | "completed"
    | "failed"
    | "cancelled";
  jobUpdatedAt: Date;
  sourceBucket: string;
  sourceHash: string;
  sourceId: string;
  sourceMimeType: string | null;
  sourceObjectKey: string | null;
  sourceSizeBytes: number | null;
  sourceUri: string;
  sourceScanStatus:
    | "not_scanned"
    | "pending"
    | "clean"
    | "infected"
    | "scan_failed";
  sourceUploadedAt: Date | null;
  sourceUploadStatus: "pending_upload" | "available" | "upload_failed";
}

export async function uploadDocumentFileOperation(
  options: KnowledgeBaseServiceOptions,
  input: UploadInput,
): Promise<UploadResult> {
  try {
    return await runUploadDocumentFileOperation(options, input);
  } catch {
    return createInternalError();
  }
}

async function runUploadDocumentFileOperation(
  options: KnowledgeBaseServiceOptions,
  input: UploadInput,
): Promise<UploadResult> {
  const objectStorage = options.objectStorage;
  const sourceBucket = options.sourceBucket;
  if (objectStorage === undefined || sourceBucket === undefined) {
    return createInternalError();
  }

  const authorization = await authorizeUpload(options.db, input);
  if (!authorization.ok) {
    return authorization.error;
  }

  const duplicate = await findExistingUploadResult(options.db, input);
  if (duplicate !== null) {
    await writeUploadAudit(options.db, {
      action: "document.duplicate_upload_ignored",
      documentId: duplicate.document.id,
      input,
      jobId: duplicate.job.id,
      metadata: {
        duplicate: true,
        knowledgeBaseId: input.knowledgeBaseId,
        mimeType: duplicate.source.mimeType,
        sizeBytes: duplicate.source.sizeBytes,
        sourceHash: duplicate.source.sourceHash,
        sourceType: "file",
      },
    });

    return {
      ok: true,
      result: {
        ...duplicate,
        duplicate: true,
      },
    };
  }

  let reservation: ReservedUpload;
  try {
    reservation = await reserveUploadMetadata(options.db, sourceBucket, input);
  } catch (error) {
    if (isUniqueViolation(error)) {
      const conflictedDuplicate = await findExistingUploadResult(options.db, input);
      if (conflictedDuplicate !== null) {
        await writeUploadAudit(options.db, {
          action: "document.duplicate_upload_ignored",
          documentId: conflictedDuplicate.document.id,
          input,
          jobId: conflictedDuplicate.job.id,
          metadata: {
            duplicate: true,
            knowledgeBaseId: input.knowledgeBaseId,
            mimeType: conflictedDuplicate.source.mimeType,
            sizeBytes: conflictedDuplicate.source.sizeBytes,
            sourceHash: conflictedDuplicate.source.sourceHash,
            sourceType: "file",
          },
        });

        return {
          ok: true,
          result: {
            ...conflictedDuplicate,
            duplicate: true,
          },
        };
      }
    }

    return fromServiceException(error);
  }

  try {
    await objectStorage.putObject({
      body: input.content,
      bucket: sourceBucket,
      contentType: input.mimeType,
      key: reservation.objectKey,
      metadata: {
        checksum: input.checksum,
        documentId: reservation.documentId,
        documentVersion: documentVersion.toString(),
        knowledgeBaseId: input.knowledgeBaseId,
        originalFilename: input.originalFilename,
        requestedBy: input.actor.user.id,
        tenantId: input.actor.tenant.id,
      },
    });
  } catch {
    await markReservedUploadFailed(options.db, {
      cleanupStatus: "not_required",
      documentId: reservation.documentId,
      errorCode: objectUploadFailedCode,
      errorMessage: "Object storage upload failed.",
      jobId: reservation.jobId,
      sourceId: reservation.sourceId,
    });

    return createInternalError();
  }

  try {
    const finalized = await finalizeUpload(options.db, input, reservation);
    return {
      ok: true,
      result: {
        ...finalized,
        duplicate: false,
      },
    };
  } catch {
    const cleanup = await cleanupObjectAfterFinalizationFailure(
      objectStorage,
      sourceBucket,
      reservation,
    );
    await markReservedUploadFailed(options.db, {
      cleanupErrorCode: cleanup.ok ? null : objectCleanupFailedCode,
      cleanupErrorMessage: cleanup.ok ? null : "Uploaded object cleanup failed.",
      cleanupStatus: cleanup.ok ? "cleanup_succeeded" : "cleanup_failed",
      documentId: reservation.documentId,
      errorCode: finalizationFailedCode,
      errorMessage: "Upload finalization failed.",
      jobId: reservation.jobId,
      sourceId: reservation.sourceId,
    });

    if (!cleanup.ok) {
      await writeUploadAudit(options.db, {
        action: "document.upload_cleanup_failed",
        documentId: reservation.documentId,
        input,
        jobId: reservation.jobId,
        metadata: {
          bucket: sourceBucket,
          knowledgeBaseId: input.knowledgeBaseId,
          objectKey: reservation.objectKey,
          sourceType: "file",
        },
      });
    }

    return createInternalError();
  }
}

async function authorizeUpload(
  db: KnowledgeDb,
  input: UploadInput,
): Promise<{ ok: true } | { ok: false; error: UploadServiceError }> {
  const knowledgeBase = await findTenantKnowledgeBaseRow(db, {
    knowledgeBaseId: input.knowledgeBaseId,
    tenantId: input.actor.tenant.id,
  });
  if (knowledgeBase === null) {
    return { error: createNotFoundError(), ok: false };
  }

  if (input.actor.role === "admin") {
    return { ok: true };
  }

  const isMember = await actorIsKnowledgeBaseMember(db, {
    actorId: input.actor.user.id,
    knowledgeBaseId: input.knowledgeBaseId,
    tenantId: input.actor.tenant.id,
  });
  if (!isMember) {
    await writeUploadAudit(db, {
      action: "auth.forbidden",
      documentId: input.knowledgeBaseId,
      input,
      jobId: null,
      metadata: {
        knowledgeBaseId: input.knowledgeBaseId,
        reason: "knowledge_base_upload_forbidden",
      },
      targetType: "knowledge_base",
    });

    return { error: createForbiddenError(), ok: false };
  }

  return { ok: true };
}

async function reserveUploadMetadata(
  db: ProjectDb,
  sourceBucket: string,
  input: UploadInput,
): Promise<ReservedUpload> {
  return db.transaction(async (tx) => {
    const documentRows = await tx
      .insert(documents)
      .values({
        createdByUserId: input.actor.user.id,
        currentVersion: documentVersion,
        knowledgeBaseId: input.knowledgeBaseId,
        metadata: {
          originalFilename: input.originalFilename,
          sourceHash: input.checksum,
        },
        status: "pending",
        tenantId: input.actor.tenant.id,
        title: input.title,
        updatedAt: sql`NOW()`,
      })
      .returning({ id: documents.id });
    const documentRow = documentRows[0];
    if (documentRow === undefined) {
      throw new Error("Document reservation failed.");
    }

    const objectKey = createDocumentObjectKey({
      documentId: documentRow.id,
      documentVersion,
      fileName: input.originalFilename,
      knowledgeBaseId: input.knowledgeBaseId,
      tenantId: input.actor.tenant.id,
    });

    const sourceRows = await tx
      .insert(documentSources)
      .values({
        bucket: sourceBucket,
        documentId: documentRow.id,
        knowledgeBaseId: input.knowledgeBaseId,
        metadata: {
          documentVersion,
          originalFilename: input.originalFilename,
          requestId: input.requestId,
        },
        mimeType: input.mimeType,
        objectCleanupStatus: "not_required",
        objectKey,
        scanStatus: "not_scanned",
        sizeBytes: input.sizeBytes,
        sourceHash: input.checksum,
        sourceType: "file",
        sourceUri: input.originalFilename,
        tenantId: input.actor.tenant.id,
        uploadStatus: "pending_upload",
      })
      .returning({ id: documentSources.id });
    const sourceRow = sourceRows[0];
    if (sourceRow === undefined) {
      throw new Error("Source reservation failed.");
    }

    const jobRows = await tx
      .insert(ingestionJobs)
      .values({
        documentId: documentRow.id,
        knowledgeBaseId: input.knowledgeBaseId,
        metadata: {
          bucket: sourceBucket,
          documentVersion,
          objectKey,
          sourceId: sourceRow.id,
        },
        requestedByUserId: input.actor.user.id,
        sourceHash: input.checksum,
        sourceType: "file",
        status: "pending_source",
        tenantId: input.actor.tenant.id,
        updatedAt: sql`NOW()`,
      })
      .returning({ id: ingestionJobs.id });
    const jobRow = jobRows[0];
    if (jobRow === undefined) {
      throw new Error("Ingestion job reservation failed.");
    }

    return {
      documentId: documentRow.id,
      jobId: jobRow.id,
      objectKey,
      sourceId: sourceRow.id,
    };
  });
}

async function finalizeUpload(
  db: ProjectDb,
  input: UploadInput,
  reservation: ReservedUpload,
): Promise<Omit<DocumentFileUploadResult, "duplicate">> {
  return db.transaction(async (tx) => {
    await tx
      .update(documentSources)
      .set({
        objectCleanupStatus: "not_required",
        scanStatus: "not_scanned",
        updatedAt: sql`NOW()`,
        uploadedAt: sql`NOW()`,
        uploadErrorCode: null,
        uploadErrorMessage: null,
        uploadStatus: "available",
      })
      .where(eq(documentSources.id, reservation.sourceId));

    await tx
      .update(ingestionJobs)
      .set({
        lastErrorCode: null,
        lastErrorMessage: null,
        queuedAt: sql`NOW()`,
        status: "queued",
        updatedAt: sql`NOW()`,
      })
      .where(eq(ingestionJobs.id, reservation.jobId));

    await writeUploadAudit(tx, {
      action: "document.uploaded",
      documentId: reservation.documentId,
      input,
      jobId: reservation.jobId,
      metadata: {
        knowledgeBaseId: input.knowledgeBaseId,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        sourceHash: input.checksum,
        sourceType: "file",
      },
    });

    const result = await findUploadResultBySourceId(tx, {
      sourceId: reservation.sourceId,
      tenantId: input.actor.tenant.id,
    });
    if (result === null) {
      throw new Error("Finalized upload result not found.");
    }

    return result;
  });
}

async function findExistingUploadResult(
  db: KnowledgeDb,
  input: UploadInput,
): Promise<Omit<DocumentFileUploadResult, "duplicate"> | null> {
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

async function findUploadResultBySourceId(
  db: KnowledgeDb,
  input: { sourceId: string; tenantId: string },
): Promise<Omit<DocumentFileUploadResult, "duplicate"> | null> {
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

async function markReservedUploadFailed(
  db: ProjectDb,
  input: {
    cleanupErrorCode?: string | null;
    cleanupErrorMessage?: string | null;
    cleanupStatus:
      | "not_required"
      | "pending_cleanup"
      | "cleanup_succeeded"
      | "cleanup_failed";
    documentId: string;
    errorCode: string;
    errorMessage: string;
    jobId: string;
    sourceId: string;
  },
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(documentSources)
      .set({
        objectCleanupErrorCode: input.cleanupErrorCode ?? null,
        objectCleanupErrorMessage: input.cleanupErrorMessage ?? null,
        objectCleanupStatus: input.cleanupStatus,
        updatedAt: sql`NOW()`,
        uploadErrorCode: input.errorCode,
        uploadErrorMessage: input.errorMessage,
        uploadStatus: "upload_failed",
      })
      .where(eq(documentSources.id, input.sourceId));

    await tx
      .update(ingestionJobs)
      .set({
        finishedAt: sql`NOW()`,
        lastErrorCode: input.errorCode,
        lastErrorMessage: input.errorMessage,
        status: "failed",
        updatedAt: sql`NOW()`,
      })
      .where(eq(ingestionJobs.id, input.jobId));

    await tx
      .update(documents)
      .set({
        status: "failed",
        updatedAt: sql`NOW()`,
      })
      .where(eq(documents.id, input.documentId));
  });
}

async function cleanupObjectAfterFinalizationFailure(
  objectStorage: ObjectStorageClient,
  sourceBucket: string,
  reservation: ReservedUpload,
): Promise<{ ok: true } | { ok: false }> {
  try {
    await objectStorage.deleteObject({
      bucket: sourceBucket,
      key: reservation.objectKey,
    });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

async function writeUploadAudit(
  db: KnowledgeDb,
  input: {
    action:
      | "auth.forbidden"
      | "document.duplicate_upload_ignored"
      | "document.upload_cleanup_failed"
      | "document.uploaded";
    documentId: string;
    input: UploadInput;
    jobId: string | null;
    metadata: Record<string, unknown>;
    targetType?: string;
  },
): Promise<void> {
  await db.insert(auditLogs).values({
    action: input.action,
    actorId: input.input.actor.user.id,
    actorType: "user",
    ipSummary: input.input.ipSummary,
    metadata: {
      ...input.metadata,
      ...(input.jobId === null ? {} : { jobId: input.jobId }),
    },
    requestId: input.input.requestId,
    targetId: input.documentId,
    targetType: input.targetType ?? "document",
    tenantId: input.input.actor.tenant.id,
    userAgentSummary: input.input.userAgentSummary,
  });
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return false;
  }

  return error.code === "23505";
}
