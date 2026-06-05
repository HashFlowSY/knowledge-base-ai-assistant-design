import type { DocumentProcessingSummary } from "@kb/knowledge";

import { knowledgeCopy } from "../../copy/knowledge";

type IngestionJobStatus = NonNullable<DocumentProcessingSummary["job"]>["status"];

const activeJobStatuses: readonly IngestionJobStatus[] = [
  "pending_source",
  "queued",
  "running",
  "retrying",
];

export function isActiveDocumentProcessingStatus(
  status: IngestionJobStatus,
): boolean {
  return activeJobStatuses.includes(status);
}

export function getRetryDisabledReason(
  document: DocumentProcessingSummary,
): string {
  if (document.source?.objectCleanupStatus === "cleanup_failed") {
    return knowledgeCopy.documentProcessing.cleanupFailed;
  }

  if (document.job === null) {
    return knowledgeCopy.documentProcessing.unavailable;
  }

  if (isActiveDocumentProcessingStatus(document.job.status)) {
    return knowledgeCopy.documentProcessing.activeDisabled;
  }

  if (document.job.status === "completed" || document.status === "ready") {
    return knowledgeCopy.documentProcessing.completedDisabled;
  }

  if (document.job.status === "failed" && document.job.attempts >= document.job.maxAttempts) {
    return knowledgeCopy.documentProcessing.exhausted;
  }

  return knowledgeCopy.documentProcessing.unavailable;
}
