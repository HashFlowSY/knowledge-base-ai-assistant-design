import { eq, sql } from "drizzle-orm";

import { documentSources, ingestionJobs, type ProjectDb } from "@kb/db";

import type { DocumentFileUploadResult } from "../../../schemas";
import { createDocumentFileIngestionPayload } from "../../../ingestion-queue";
import type { KnowledgeBaseServiceOptions } from "../../../service-types";
import { markUploadQueueEnqueueFailed } from "./failures";
import { findUploadResultBySourceId } from "../metadata/results";
import { logUploadFailure, writeUploadAudit } from "../observability/audit";
import type {
  ReservedUpload,
  UploadInput,
  UploadResultWithoutDuplicate,
} from "../shared/types";

export async function finalizeUpload(
  db: ProjectDb,
  input: UploadInput,
  reservation: ReservedUpload,
): Promise<UploadResultWithoutDuplicate> {
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

export async function enqueueFinalizedUpload(
  options: KnowledgeBaseServiceOptions,
  input: UploadInput,
  result: DocumentFileUploadResult,
): Promise<DocumentFileUploadResult> {
  if (options.ingestionQueueProducer === undefined) {
    return result;
  }

  try {
    await options.ingestionQueueProducer.enqueue(
      createDocumentFileIngestionPayload({
        requestedBy: input.actor.user.id,
        tenantId: input.actor.tenant.id,
        upload: result,
      }),
    );

    return result;
  } catch (error) {
    logUploadFailure(options, "document_upload_queue_enqueue_failed", input, {
      documentId: result.document.id,
      error,
      jobId: result.job.id,
    });
    await markUploadQueueEnqueueFailed(options.db, {
      jobId: result.job.id,
      tenantId: input.actor.tenant.id,
    });
    const refreshed = await findUploadResultBySourceId(options.db, {
      sourceId: result.source.id,
      tenantId: input.actor.tenant.id,
    });

    return {
      ...(refreshed ?? result),
      duplicate: false,
    };
  }
}
