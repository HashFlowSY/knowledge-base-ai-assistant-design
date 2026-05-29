import { eq, sql } from "drizzle-orm";

import {
  documents,
  documentSources,
  ingestionJobLogs,
  ingestionJobs,
  type ProjectDb,
} from "@kb/db";
import type { ObjectStorageClient } from "@kb/storage";

import { queueEnqueueFailedCode } from "../shared/constants";
import type { ReservedUpload } from "../shared/types";

export async function markReservedUploadFailed(
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

export async function markUploadQueueEnqueueFailed(
  db: ProjectDb,
  input: {
    jobId: string;
    tenantId: string;
  },
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(ingestionJobs)
      .set({
        lastErrorCode: queueEnqueueFailedCode,
        lastErrorMessage: "Queue enqueue failed; recovery will requeue this job.",
        status: "retrying",
        updatedAt: sql`NOW()`,
      })
      .where(eq(ingestionJobs.id, input.jobId));

    await tx.insert(ingestionJobLogs).values({
      errorCode: queueEnqueueFailedCode,
      jobId: input.jobId,
      level: "error",
      message: "Queue enqueue failed; recovery will requeue this job.",
      metadata: {
        retryable: true,
      },
      tenantId: input.tenantId,
    });
  });
}

export async function cleanupObjectAfterFinalizationFailure(
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

export function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return false;
  }

  return error.code === "23505";
}
