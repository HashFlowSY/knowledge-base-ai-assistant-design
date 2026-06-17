import { and, desc, eq, isNull, sql } from "drizzle-orm";

import { documents, documentSources, ingestionJobLogs, ingestionJobs } from "@kb/db";
import { ingestionJobPayloadSchema, type IngestionJobPayload } from "@kb/queue";

import type { DocumentProcessingSummary } from "../../contracts/schemas";
import { queueEnqueueFailedCode } from "../upload-document-file/shared/constants";
import { createInternalError, createNotFoundError } from "../../service/errors";
import {
  findVisibleKnowledgeBaseRow,
  listKnowledgeBaseDocumentProcessingSummaries,
} from "../../service/queries";
import { toDocumentProcessingSummary } from "../../service/mappers";
import type {
  KnowledgeBaseService,
  KnowledgeBaseServiceOptions,
} from "../../service/types";

type RetryDocumentProcessingInput = Parameters<
  KnowledgeBaseService["retryDocumentProcessing"]
>[0];

interface RetryCandidateRow {
  attempts: number;
  currentVersion: number;
  documentId: string;
  ingestionJobId: string;
  knowledgeBaseId: string;
  maxAttempts: number;
  objectCleanupStatus:
    | "not_required"
    | "pending_cleanup"
    | "cleanup_in_progress"
    | "cleanup_succeeded"
    | "cleanup_failed"
    | null;
  sourceObjectKey: string | null;
  sourceType: "file" | "url";
  status:
    | "pending_source"
    | "queued"
    | "running"
    | "retrying"
    | "completed"
    | "failed"
    | "cancelled";
  tenantId: string;
  queuedAt: Date;
}

export async function retryDocumentProcessingOperation(
  options: KnowledgeBaseServiceOptions,
  input: RetryDocumentProcessingInput,
): ReturnType<KnowledgeBaseService["retryDocumentProcessing"]> {
  const knowledgeBase = await findVisibleKnowledgeBaseRow(options.db, {
    actor: input.actor,
    knowledgeBaseId: input.knowledgeBaseId,
  });
  if (knowledgeBase === null) {
    throw createNotFoundError();
  }

  const candidate = await findLatestRetryCandidate(options, input);
  if (candidate === null) {
    throw createNotFoundError();
  }

  if (!canQueueRetry(candidate)) {
    return returnCurrentDocumentSummary(options, input, false);
  }

  if (options.ingestionQueueProducer === undefined) {
    return returnCurrentDocumentSummary(options, input, false);
  }

  const queued = await markDocumentProcessingRetryQueued(options, candidate);
  if (queued === null) {
    return returnCurrentDocumentSummary(options, input, false);
  }

  let wasQueued = true;
  try {
    await options.ingestionQueueProducer.enqueue(
      createFileIngestionRetryPayload(queued, input.actor.user.id),
    );
  } catch {
    wasQueued = false;
    await markRetryQueueEnqueueFailed(options, {
      documentId: queued.documentId,
      ingestionJobId: queued.ingestionJobId,
      knowledgeBaseId: queued.knowledgeBaseId,
      queuedAt: queued.queuedAt,
      tenantId: queued.tenantId,
    });
  }

  return returnCurrentDocumentSummary(options, input, wasQueued);
}

async function findLatestRetryCandidate(
  options: KnowledgeBaseServiceOptions,
  input: RetryDocumentProcessingInput,
): Promise<RetryCandidateRow | null> {
  const rows = await options.db
    .select({
      attempts: ingestionJobs.attempts,
      currentVersion: documents.currentVersion,
      documentId: documents.id,
      ingestionJobId: ingestionJobs.id,
      knowledgeBaseId: ingestionJobs.knowledgeBaseId,
      maxAttempts: ingestionJobs.maxAttempts,
      objectCleanupStatus: documentSources.objectCleanupStatus,
      sourceObjectKey: documentSources.objectKey,
      sourceType: ingestionJobs.sourceType,
      status: ingestionJobs.status,
      tenantId: ingestionJobs.tenantId,
      queuedAt: ingestionJobs.queuedAt,
    })
    .from(documents)
    .innerJoin(
      ingestionJobs,
      and(
        eq(ingestionJobs.tenantId, documents.tenantId),
        eq(ingestionJobs.knowledgeBaseId, documents.knowledgeBaseId),
        eq(ingestionJobs.documentId, documents.id),
      ),
    )
    .leftJoin(
      documentSources,
      and(
        eq(documentSources.tenantId, ingestionJobs.tenantId),
        eq(documentSources.knowledgeBaseId, ingestionJobs.knowledgeBaseId),
        eq(documentSources.documentId, ingestionJobs.documentId),
        eq(documentSources.sourceHash, ingestionJobs.sourceHash),
      ),
    )
    .where(
      and(
        eq(documents.tenantId, input.actor.tenant.id),
        eq(documents.knowledgeBaseId, input.knowledgeBaseId),
        eq(documents.id, input.documentId),
        eq(ingestionJobs.knowledgeBaseId, input.knowledgeBaseId),
        isNull(documents.deletedAt),
      ),
    )
    .orderBy(desc(ingestionJobs.updatedAt), desc(ingestionJobs.createdAt))
    .limit(1);

  return rows[0] ?? null;
}

function canQueueRetry(candidate: RetryCandidateRow): boolean {
  return (
    candidate.sourceType === "file" &&
    candidate.status === "failed" &&
    candidate.attempts < candidate.maxAttempts &&
    candidate.sourceObjectKey !== null &&
    candidate.objectCleanupStatus === "not_required"
  );
}

async function markDocumentProcessingRetryQueued(
  options: KnowledgeBaseServiceOptions,
  candidate: RetryCandidateRow,
): Promise<RetryCandidateRow | null> {
  return options.db.transaction(async (tx) => {
    const rows = await tx
      .update(ingestionJobs)
      .set({
        currentStep: "source_connector",
        finishedAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
        queuedAt: sql`NOW()`,
        status: "queued",
        updatedAt: sql`NOW()`,
      })
      .where(
        and(
          eq(ingestionJobs.id, candidate.ingestionJobId),
          eq(ingestionJobs.tenantId, candidate.tenantId),
          eq(ingestionJobs.knowledgeBaseId, candidate.knowledgeBaseId),
          eq(ingestionJobs.documentId, candidate.documentId),
          eq(ingestionJobs.sourceType, "file"),
          eq(ingestionJobs.status, "failed"),
          sql`${ingestionJobs.attempts} < ${ingestionJobs.maxAttempts}`,
          sql`EXISTS (
            SELECT 1
            FROM ${documentSources}
            WHERE ${documentSources.tenantId} = ${ingestionJobs.tenantId}
              AND ${documentSources.knowledgeBaseId} = ${ingestionJobs.knowledgeBaseId}
              AND ${documentSources.documentId} = ${ingestionJobs.documentId}
              AND ${documentSources.sourceHash} = ${ingestionJobs.sourceHash}
              AND ${documentSources.uploadStatus} = 'available'
              AND ${documentSources.objectCleanupStatus} = 'not_required'
              AND ${documentSources.objectKey} = ${candidate.sourceObjectKey}
          )`,
        ),
      )
      .returning({
        attempts: ingestionJobs.attempts,
        documentId: ingestionJobs.documentId,
        ingestionJobId: ingestionJobs.id,
        knowledgeBaseId: ingestionJobs.knowledgeBaseId,
        maxAttempts: ingestionJobs.maxAttempts,
        queuedAt: ingestionJobs.queuedAt,
        sourceType: ingestionJobs.sourceType,
        status: ingestionJobs.status,
        tenantId: ingestionJobs.tenantId,
      });
    const row = rows[0];
    if (row === undefined) {
      return null;
    }

    await tx
      .update(documents)
      .set({
        status: "processing",
        updatedAt: sql`NOW()`,
      })
      .where(
        and(
          eq(documents.id, row.documentId),
          eq(documents.tenantId, row.tenantId),
          eq(documents.currentVersion, candidate.currentVersion),
        ),
      );

    await tx.insert(ingestionJobLogs).values({
      jobId: row.ingestionJobId,
      level: "info",
      message: "document_processing.retry_queued",
      metadata: {
        retryable: true,
      },
      tenantId: row.tenantId,
    });

    return {
      ...candidate,
      attempts: row.attempts,
      documentId: row.documentId,
      ingestionJobId: row.ingestionJobId,
      knowledgeBaseId: row.knowledgeBaseId,
      maxAttempts: row.maxAttempts,
      queuedAt: row.queuedAt,
      sourceType: row.sourceType,
      status: row.status,
      tenantId: row.tenantId,
    };
  });
}

function createFileIngestionRetryPayload(
  row: RetryCandidateRow,
  requestedBy: string,
): Extract<IngestionJobPayload, { type: "file_ingestion" }> {
  const payload = ingestionJobPayloadSchema.parse({
    type: "file_ingestion",
    documentId: row.documentId,
    documentVersion: row.currentVersion.toString(),
    ingestionJobId: row.ingestionJobId,
    knowledgeBaseId: row.knowledgeBaseId,
    requestedBy,
    sourceObjectKey: row.sourceObjectKey,
    tenantId: row.tenantId,
  });
  if (payload.type !== "file_ingestion") {
    throw new Error("Expected file ingestion retry payload.");
  }

  return payload;
}

async function markRetryQueueEnqueueFailed(
  options: KnowledgeBaseServiceOptions,
  input: {
    documentId: string;
    ingestionJobId: string;
    knowledgeBaseId: string;
    queuedAt: Date;
    tenantId: string;
  },
): Promise<void> {
  await options.db.transaction(async (tx) => {
    const rows = await tx
      .update(ingestionJobs)
      .set({
        lastErrorCode: queueEnqueueFailedCode,
        lastErrorMessage: "Queue enqueue failed; recovery will requeue this job.",
        status: "retrying",
        updatedAt: sql`NOW()`,
      })
      .where(
        and(
          eq(ingestionJobs.id, input.ingestionJobId),
          eq(ingestionJobs.tenantId, input.tenantId),
          eq(ingestionJobs.knowledgeBaseId, input.knowledgeBaseId),
          eq(ingestionJobs.documentId, input.documentId),
          eq(ingestionJobs.status, "queued"),
          eq(ingestionJobs.queuedAt, input.queuedAt),
        ),
      )
      .returning({ id: ingestionJobs.id });
    if (rows[0] === undefined) {
      return;
    }

    await tx.insert(ingestionJobLogs).values({
      errorCode: queueEnqueueFailedCode,
      jobId: input.ingestionJobId,
      level: "error",
      message: "Queue enqueue failed; recovery will requeue this job.",
      metadata: {
        retryable: true,
      },
      tenantId: input.tenantId,
    });
  });
}

async function returnCurrentDocumentSummary(
  options: KnowledgeBaseServiceOptions,
  input: RetryDocumentProcessingInput,
  queued: boolean,
): ReturnType<KnowledgeBaseService["retryDocumentProcessing"]> {
  const summary = await findDocumentProcessingSummary(options, input);
  if (summary === null) {
    throw createInternalError();
  }

  return {
    ok: true,
    result: {
      document: summary,
      queued,
    },
  };
}

async function findDocumentProcessingSummary(
  options: KnowledgeBaseServiceOptions,
  input: RetryDocumentProcessingInput,
): Promise<DocumentProcessingSummary | null> {
  const rows = await listKnowledgeBaseDocumentProcessingSummaries(options.db, {
    documentId: input.documentId,
    knowledgeBaseId: input.knowledgeBaseId,
    query: {
      page: 1,
      pageSize: 1,
    },
    tenantId: input.actor.tenant.id,
  });
  const row = rows.items[0];
  if (row === undefined) {
    return null;
  }

  return toDocumentProcessingSummary(row.document, {
    job: row.job,
    progress: row.progress,
    source: row.source,
  });
}
