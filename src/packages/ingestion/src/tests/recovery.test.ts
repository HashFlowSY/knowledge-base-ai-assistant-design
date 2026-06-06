import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { cleanupPendingSourceObjects, type IngestionCleanupRepository } from "../index";

describe("@kb/ingestion recovery", () => {
  it("claims pending source objects before deletion and records cleanup success", async () => {
    const deletedKeys: string[] = [];
    const completedInputs: { claimToken: string; sourceId: string }[] = [];
    const events: string[] = [];
    const claimTokens = new Map<string, string>();
    const repository = createFakeCleanupRepository({
      cleanups: [
        {
          bucket: "kb-source",
          id: "source_1",
          objectKey: "tenants/tenant_1/source.txt",
        },
      ],
      onClaim: (input) => {
        claimTokens.set(input.sourceId, input.claimToken);
        events.push(`claim:${input.sourceId}`);
      },
      onComplete: (input) => {
        events.push(`complete:${input.sourceId}`);
        completedInputs.push(input);
      },
      onSoftDeleteDocument: (input) =>
        events.push(`soft-delete-document:${input.sourceId}`),
    });

    const result = await cleanupPendingSourceObjects({
      batchSize: 10,
      now: () => new Date("2026-06-05T08:00:00.000Z"),
      objectStorage: {
        async deleteObject(input) {
          events.push(`delete-object:${input.key}`);
          deletedKeys.push(input.key);
        },
      },
      repository,
      staleAfterMs: 60_000,
    });

    expect(result).toEqual({ cleaned: 1, failed: 0 });
    expect(deletedKeys).toEqual(["tenants/tenant_1/source.txt"]);
    expect(completedInputs).toEqual([
      {
        claimToken: expect.any(String) as string,
        sourceId: "source_1",
      },
    ]);
    expect(completedInputs[0]?.claimToken).toBe(claimTokens.get("source_1"));
    expect(events).toEqual([
      "claim:source_1",
      "soft-delete-document:source_1",
      "delete-object:tenants/tenant_1/source.txt",
      "complete:source_1",
    ]);
  });

  it("skips source cleanup candidates claimed by another worker", async () => {
    const deletedKeys: string[] = [];
    const completedInputs: { claimToken: string; sourceId: string }[] = [];
    const failedInputs: { claimToken: string; sourceId: string }[] = [];
    const events: string[] = [];
    const repository = createFakeCleanupRepository({
      cleanups: [
        {
          bucket: "kb-source",
          claimable: false,
          id: "source_1",
          objectKey: "tenants/tenant_1/already-claimed.txt",
        },
        {
          bucket: "kb-source",
          id: "source_2",
          objectKey: "tenants/tenant_1/source.txt",
        },
      ],
      onClaim: (input) => events.push(`claim:${input.sourceId}`),
      onComplete: (input) => {
        events.push(`complete:${input.sourceId}`);
        completedInputs.push(input);
      },
      onFail: (input) => failedInputs.push(input),
      onSoftDeleteDocument: (input) =>
        events.push(`soft-delete-document:${input.sourceId}`),
    });

    const result = await cleanupPendingSourceObjects({
      batchSize: 10,
      now: () => new Date("2026-06-05T08:00:00.000Z"),
      objectStorage: {
        async deleteObject(input) {
          events.push(`delete-object:${input.key}`);
          deletedKeys.push(input.key);
        },
      },
      repository,
      staleAfterMs: 60_000,
    });

    expect(result).toEqual({ cleaned: 1, failed: 0 });
    expect(deletedKeys).toEqual(["tenants/tenant_1/source.txt"]);
    expect(completedInputs).toHaveLength(1);
    expect(completedInputs[0]?.sourceId).toBe("source_2");
    expect(failedInputs).toEqual([]);
    expect(events).toEqual([
      "claim:source_1",
      "claim:source_2",
      "soft-delete-document:source_2",
      "delete-object:tenants/tenant_1/source.txt",
      "complete:source_2",
    ]);
  });

  it("skips object deletion when the source cleanup claim is lost", async () => {
    const deletedKeys: string[] = [];
    const repository = createFakeCleanupRepository({
      cleanups: [
        {
          bucket: "kb-source",
          id: "source_1",
          objectKey: "tenants/tenant_1/source.txt",
          softDeleteResult: false,
        },
      ],
    });

    const result = await cleanupPendingSourceObjects({
      batchSize: 10,
      now: () => new Date("2026-06-05T08:00:00.000Z"),
      objectStorage: {
        async deleteObject(input) {
          deletedKeys.push(input.key);
        },
      },
      repository,
      staleAfterMs: 60_000,
    });

    expect(result).toEqual({ cleaned: 0, failed: 0 });
    expect(deletedKeys).toEqual([]);
  });

  it("records safe cleanup failures without stopping later objects", async () => {
    const completedSourceIds: string[] = [];
    const failedInputs: {
      errorCode: string;
      errorMessage: string;
      sourceId: string;
    }[] = [];
    const repository = createFakeCleanupRepository({
      cleanups: [
        {
          bucket: "kb-source",
          id: "source_1",
          objectKey: "tenants/tenant_1/fail.txt",
        },
        {
          bucket: "kb-source",
          id: "source_2",
          objectKey: "tenants/tenant_1/ok.txt",
        },
      ],
      onComplete: (input) => completedSourceIds.push(input.sourceId),
      onFail: (input) =>
        failedInputs.push({
          errorCode: input.errorCode,
          errorMessage: input.errorMessage,
          sourceId: input.sourceId,
        }),
    });

    const result = await cleanupPendingSourceObjects({
      batchSize: 10,
      now: () => new Date("2026-06-05T08:00:00.000Z"),
      objectStorage: {
        async deleteObject(input) {
          if (input.key.endsWith("fail.txt")) {
            throw new Error("storage unavailable for tenants/tenant_1/fail.txt");
          }
        },
      },
      repository,
      staleAfterMs: 60_000,
    });

    expect(result).toEqual({ cleaned: 1, failed: 1 });
    expect(completedSourceIds).toEqual(["source_2"]);
    expect(failedInputs).toEqual([
      {
        errorCode: "OBJECT_CLEANUP_FAILED",
        errorMessage: "Object cleanup failed.",
        sourceId: "source_1",
      },
    ]);
    expect(JSON.stringify(failedInputs)).not.toContain("tenants/tenant_1");
  });

  it("treats already-missing source objects as cleanup success", async () => {
    const completedSourceIds: string[] = [];
    const failedInputs: { errorCode: string; sourceId: string }[] = [];
    const repository = createFakeCleanupRepository({
      cleanups: [
        {
          bucket: "kb-source",
          id: "source_1",
          objectKey: "tenants/tenant_1/missing.txt",
        },
      ],
      onComplete: (input) => completedSourceIds.push(input.sourceId),
      onFail: (input) =>
        failedInputs.push({
          errorCode: input.errorCode,
          sourceId: input.sourceId,
        }),
    });

    const result = await cleanupPendingSourceObjects({
      batchSize: 10,
      now: () => new Date("2026-06-05T08:00:00.000Z"),
      objectStorage: {
        async deleteObject() {
          const error = new Error("Object not found");
          error.name = "NoSuchKey";
          throw error;
        },
      },
      repository,
      staleAfterMs: 60_000,
    });

    expect(result).toEqual({ cleaned: 1, failed: 0 });
    expect(completedSourceIds).toEqual(["source_1"]);
    expect(failedInputs).toEqual([]);
  });

  it("uses claim tokens and in-progress status for source cleanup state transitions", () => {
    const source = readFileSync(
      new URL("../repositories/drizzle-source-cleanup-repository.ts", import.meta.url),
      "utf8",
    );
    const claimBlock = source.slice(
      source.indexOf("async claimSourceObjectCleanup"),
      source.indexOf("async completeSourceObjectCleanup"),
    );
    const completeBlock = source.slice(
      source.indexOf("async completeSourceObjectCleanup"),
      source.indexOf("async softDeleteSourceDocumentForCleanup"),
    );
    const softDeleteBlock = source.slice(
      source.indexOf("async softDeleteSourceDocumentForCleanup"),
      source.indexOf("async failSourceObjectCleanup"),
    );
    const failBlock = source.slice(
      source.indexOf("async failSourceObjectCleanup"),
      source.length,
    );

    expect(claimBlock).toContain('objectCleanupStatus: "cleanup_in_progress"');
    expect(claimBlock).toContain("objectCleanupClaimToken: input.claimToken");
    expect(claimBlock).toContain("objectCleanupClaimedAt");
    expect(completeBlock).toContain(
      'eq(documentSources.objectCleanupStatus, "cleanup_in_progress")',
    );
    expect(completeBlock).toContain(
      "eq(documentSources.objectCleanupClaimToken, input.claimToken)",
    );
    expect(softDeleteBlock).toContain(
      'eq(documentSources.objectCleanupStatus, "cleanup_in_progress")',
    );
    expect(softDeleteBlock).toContain(
      "eq(documentSources.objectCleanupClaimToken, input.claimToken)",
    );
    expect(failBlock).toContain(
      'eq(documentSources.objectCleanupStatus, "cleanup_in_progress")',
    );
    expect(failBlock).toContain(
      "eq(documentSources.objectCleanupClaimToken, input.claimToken)",
    );
  });

  it("repairs source cleanup success rows whose documents were not soft-deleted", () => {
    const source = readFileSync(
      new URL("../repositories/drizzle-source-cleanup-repository.ts", import.meta.url),
      "utf8",
    );
    const cleanupListBlock = source.slice(
      source.indexOf("async listPendingSourceObjectCleanups"),
      source.indexOf("async claimSourceObjectCleanup"),
    );

    expect(cleanupListBlock).toContain(
      'eq(documentSources.objectCleanupStatus, "cleanup_succeeded")',
    );
    expect(cleanupListBlock).toContain("isNull(documents.deletedAt)");
  });

  it("releases active upload dedupe keys when exhausted file jobs enter cleanup", () => {
    const source = readFileSync(
      new URL("../repositories/drizzle-file-job-repository.ts", import.meta.url),
      "utf8",
    );
    const failJobBlock = source.slice(source.indexOf("async failJob"), source.length);

    expect(failJobBlock).toContain('objectCleanupStatus: "pending_cleanup"');
    expect(failJobBlock).toContain('uploadStatus: "upload_failed"');
  });

  it("releases active upload dedupe keys when soft-deleting source documents", () => {
    const source = readFileSync(
      new URL("../repositories/drizzle-source-cleanup-repository.ts", import.meta.url),
      "utf8",
    );
    const softDeleteBlock = source.slice(
      source.indexOf("async softDeleteSourceDocumentForCleanup"),
      source.indexOf("async failSourceObjectCleanup"),
    );

    expect(softDeleteBlock).toContain(".update(documentSources)");
    expect(softDeleteBlock).toContain('uploadStatus: "upload_failed"');
    expect(softDeleteBlock).toContain("eq(documentSources.id, input.sourceId)");
  });
});

function createFakeCleanupRepository(input: {
  cleanups: {
    bucket: string;
    claimable?: boolean;
    id: string;
    objectKey: string;
    softDeleteResult?: boolean;
  }[];
  onClaim?: (input: {
    claimToken: string;
    sourceId: string;
    updatedBefore: Date;
  }) => void;
  onComplete?: (input: { claimToken: string; sourceId: string }) => void;
  onFail?: (input: {
    claimToken: string;
    errorCode: string;
    errorMessage: string;
    sourceId: string;
  }) => void;
  onSoftDeleteDocument?: (input: { claimToken: string; sourceId: string }) => void;
}): IngestionCleanupRepository {
  return {
    async claimSourceObjectCleanup(claimInput) {
      input.onClaim?.(claimInput);
      const cleanup = input.cleanups.find(
        (candidate) =>
          candidate.id === claimInput.sourceId && candidate.claimable !== false,
      );
      if (cleanup === undefined) {
        return null;
      }

      return {
        bucket: cleanup.bucket,
        claimToken: claimInput.claimToken,
        id: cleanup.id,
        objectKey: cleanup.objectKey,
      };
    },
    async completeSourceObjectCleanup(completeInput) {
      input.onComplete?.(completeInput);
    },
    async failSourceObjectCleanup(failInput) {
      input.onFail?.(failInput);
    },
    async listPendingSourceObjectCleanups(listInput) {
      return input.cleanups.slice(0, listInput.limit).map((cleanup) => ({
        id: cleanup.id,
      }));
    },
    async softDeleteSourceDocumentForCleanup(softDeleteInput) {
      input.onSoftDeleteDocument?.(softDeleteInput);
      const cleanup = input.cleanups.find(
        (candidate) => candidate.id === softDeleteInput.sourceId,
      );
      return cleanup?.softDeleteResult ?? true;
    },
  };
}
