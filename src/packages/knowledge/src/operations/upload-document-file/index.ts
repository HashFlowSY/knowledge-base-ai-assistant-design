import {
  documentVersion,
  finalizationFailedCode,
  objectCleanupFailedCode,
  objectUploadFailedCode,
} from "./shared/constants";
import { authorizeUpload } from "./access/authorization";
import {
  cleanupObjectAfterFinalizationFailure,
  isUniqueViolation,
  markReservedUploadFailed,
} from "./lifecycle/failures";
import { enqueueFinalizedUpload, finalizeUpload } from "./lifecycle/finalization";
import { reserveUploadMetadata } from "./metadata/reservation";
import { findExistingUploadResult } from "./metadata/results";
import { logUploadFailure, writeUploadAudit } from "./observability/audit";
import {
  createInternalError,
  fromServiceException,
} from "../../service-errors";
import type { KnowledgeBaseServiceOptions } from "../../service-types";
import type {
  ReservedUpload,
  UploadInput,
  UploadResult,
  UploadResultWithoutDuplicate,
} from "./shared/types";

export async function uploadDocumentFileOperation(
  options: KnowledgeBaseServiceOptions,
  input: UploadInput,
): Promise<UploadResult> {
  try {
    return await runUploadDocumentFileOperation(options, input);
  } catch (error) {
    logUploadFailure(options, "document_upload_operation_failed", input, {
      error,
    });
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
    return createDuplicateUploadResult(options, input, duplicate);
  }

  let reservation: ReservedUpload;
  try {
    reservation = await reserveUploadMetadata(options.db, sourceBucket, input);
  } catch (error) {
    if (isUniqueViolation(error)) {
      const conflictedDuplicate = await findExistingUploadResult(options.db, input);
      if (conflictedDuplicate !== null) {
        return createDuplicateUploadResult(options, input, conflictedDuplicate);
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
  } catch (error) {
    logUploadFailure(options, "document_upload_object_put_failed", input, {
      documentId: reservation.documentId,
      error,
      jobId: reservation.jobId,
    });
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
    const result = await enqueueFinalizedUpload(options, input, {
      ...finalized,
      duplicate: false,
    });
    return {
      ok: true,
      result,
    };
  } catch (error) {
    logUploadFailure(options, "document_upload_finalization_failed", input, {
      documentId: reservation.documentId,
      error,
      jobId: reservation.jobId,
    });
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
      logUploadFailure(options, "document_upload_object_cleanup_failed", input, {
        documentId: reservation.documentId,
        error: "Object cleanup failed.",
        jobId: reservation.jobId,
      });
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

async function createDuplicateUploadResult(
  options: KnowledgeBaseServiceOptions,
  input: UploadInput,
  duplicate: UploadResultWithoutDuplicate,
): Promise<UploadResult> {
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
