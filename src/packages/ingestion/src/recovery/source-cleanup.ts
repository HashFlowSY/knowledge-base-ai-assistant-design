import { randomUUID } from "node:crypto";

import type { IngestionSourceCleanupOptions } from "../contracts/types";

const objectCleanupFailedCode = "OBJECT_CLEANUP_FAILED";

export async function cleanupPendingSourceObjects(
  options: IngestionSourceCleanupOptions,
): Promise<{ cleaned: number; failed: number }> {
  const now = options.now?.() ?? new Date();
  const updatedBefore = new Date(now.getTime() - options.staleAfterMs);
  const cleanups = await options.repository.listPendingSourceObjectCleanups({
    limit: options.batchSize,
    updatedBefore,
  });
  let cleaned = 0;
  let failed = 0;

  for (const candidate of cleanups) {
    const cleanup = await options.repository.claimSourceObjectCleanup({
      claimToken: randomUUID(),
      sourceId: candidate.id,
      updatedBefore,
    });
    if (cleanup === null) {
      continue;
    }

    try {
      const claimStillCurrent =
        await options.repository.softDeleteSourceDocumentForCleanup({
          claimToken: cleanup.claimToken,
          sourceId: cleanup.id,
        });
      if (!claimStillCurrent) {
        continue;
      }

      await options.objectStorage.deleteObject({
        bucket: cleanup.bucket,
        key: cleanup.objectKey,
      });
      await options.repository.completeSourceObjectCleanup({
        claimToken: cleanup.claimToken,
        sourceId: cleanup.id,
      });
      cleaned += 1;
    } catch (error) {
      if (isObjectAlreadyMissing(error)) {
        await options.repository.completeSourceObjectCleanup({
          claimToken: cleanup.claimToken,
          sourceId: cleanup.id,
        });
        cleaned += 1;
        continue;
      }

      await options.repository.failSourceObjectCleanup({
        claimToken: cleanup.claimToken,
        errorCode: objectCleanupFailedCode,
        errorMessage: normalizeCleanupErrorMessage(),
        sourceId: cleanup.id,
      });
      failed += 1;
    }
  }

  return { cleaned, failed };
}

function normalizeCleanupErrorMessage(): string {
  return "Object cleanup failed.";
}

function isObjectAlreadyMissing(error: unknown): boolean {
  const code =
    readErrorStringProperty(error, "Code") ??
    readErrorStringProperty(error, "code") ??
    readErrorStringProperty(error, "name");

  if (code === "NoSuchKey" || code === "NotFound" || code === "NotFoundError") {
    return true;
  }

  return error instanceof Error && error.message === "Object not found";
}

function readErrorStringProperty(error: unknown, key: string): string | null {
  if (typeof error !== "object" || error === null || !(key in error)) {
    return null;
  }

  const value = (error as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}
