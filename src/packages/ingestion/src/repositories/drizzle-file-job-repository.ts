import { and, eq, inArray, sql } from "drizzle-orm";

import { documents, documentSources, ingestionJobLogs, ingestionJobs } from "@kb/db";

import type {
  DrizzleIngestionRepositoryOptions,
  IngestionPipelineRepository,
} from "../contracts/types";

type DrizzleFileJobRepository = Pick<
  IngestionPipelineRepository,
  "claimFileJob" | "recordStep" | "completeJob" | "failJob"
>;

export function createDrizzleFileJobRepository(
  options: DrizzleIngestionRepositoryOptions,
): DrizzleFileJobRepository {
  return {
    async claimFileJob(payload) {
      const documentVersion = parseDocumentVersion(payload.documentVersion);
      const rows = await options.db
        .update(ingestionJobs)
        .set({
          attempts: sql`${ingestionJobs.attempts} + 1`,
          currentStep: "source_connector",
          lastErrorCode: null,
          lastErrorMessage: null,
          startedAt: sql`COALESCE(${ingestionJobs.startedAt}, NOW())`,
          status: "running",
          updatedAt: sql`NOW()`,
        })
        .where(
          and(
            eq(ingestionJobs.id, payload.ingestionJobId),
            eq(ingestionJobs.tenantId, payload.tenantId),
            inArray(ingestionJobs.status, ["queued", "retrying"]),
          ),
        )
        .returning({
          attempts: ingestionJobs.attempts,
          id: ingestionJobs.id,
          maxAttempts: ingestionJobs.maxAttempts,
        });

      const row = rows[0];
      if (row === undefined) {
        return { status: "already_claimed" };
      }

      return {
        status: "claimed",
        context: {
          documentId: payload.documentId,
          documentVersion,
          ingestionJobId: payload.ingestionJobId,
          knowledgeBaseId: payload.knowledgeBaseId,
          attempts: row.attempts,
          maxAttempts: row.maxAttempts,
          requestedBy: payload.requestedBy,
          sourceObjectKey: payload.sourceObjectKey,
          tenantId: payload.tenantId,
        },
      };
    },
    async recordStep(input) {
      await options.db.transaction(async (tx) => {
        await tx.insert(ingestionJobLogs).values({
          ...(input.errorCode === undefined ? {} : { errorCode: input.errorCode }),
          jobId: input.ingestionJobId,
          level: input.status === "failed" ? "error" : "info",
          message: input.message,
          metadata: input.metadata,
          step: input.step,
          tenantId: input.tenantId,
        });

        await tx
          .update(ingestionJobs)
          .set({
            currentStep: input.step,
            updatedAt: sql`NOW()`,
          })
          .where(eq(ingestionJobs.id, input.ingestionJobId));
      });
    },
    async completeJob(input) {
      await options.db.transaction(async (tx) => {
        await tx
          .update(ingestionJobs)
          .set({
            currentStep: "index_writer",
            finishedAt: sql`NOW()`,
            lastErrorCode: null,
            lastErrorMessage: null,
            status: "completed",
            updatedAt: sql`NOW()`,
          })
          .where(eq(ingestionJobs.id, input.ingestionJobId));

        const rows = await tx
          .select({ documentId: ingestionJobs.documentId })
          .from(ingestionJobs)
          .where(eq(ingestionJobs.id, input.ingestionJobId))
          .limit(1);
        const row = rows[0];
        if (row !== undefined) {
          await tx
            .update(documents)
            .set({
              status: "ready",
              updatedAt: sql`NOW()`,
            })
            .where(
              and(
                eq(documents.id, row.documentId),
                eq(documents.currentVersion, input.documentVersion),
              ),
            );
        }
      });
    },
    async failJob(input) {
      await options.db.transaction(async (tx) => {
        await tx
          .update(ingestionJobs)
          .set({
            finishedAt: input.shouldRetry ? null : sql`NOW()`,
            lastErrorCode: input.errorCode,
            lastErrorMessage: input.errorMessage,
            status: input.shouldRetry ? "retrying" : "failed",
            updatedAt: sql`NOW()`,
          })
          .where(eq(ingestionJobs.id, input.ingestionJobId));

        const rows = await tx
          .select({
            documentId: ingestionJobs.documentId,
            sourceHash: ingestionJobs.sourceHash,
            sourceType: ingestionJobs.sourceType,
            tenantId: ingestionJobs.tenantId,
          })
          .from(ingestionJobs)
          .where(eq(ingestionJobs.id, input.ingestionJobId))
          .limit(1);
        const row = rows[0];
        if (row !== undefined) {
          await tx
            .update(documents)
            .set({
              status: "failed",
              updatedAt: sql`NOW()`,
            })
            .where(
              and(
                eq(documents.id, row.documentId),
                eq(documents.currentVersion, input.documentVersion),
              ),
            );

          if (
            !input.shouldRetry &&
            row.sourceType === "file" &&
            row.sourceHash !== null
          ) {
            await tx
              .update(documentSources)
              .set({
                objectCleanupErrorCode: null,
                objectCleanupErrorMessage: null,
                objectCleanupStatus: "pending_cleanup",
                updatedAt: sql`NOW()`,
                uploadStatus: "upload_failed",
              })
              .where(
                and(
                  eq(documentSources.tenantId, row.tenantId),
                  eq(documentSources.documentId, row.documentId),
                  eq(documentSources.sourceHash, row.sourceHash),
                  eq(documentSources.uploadStatus, "available"),
                  inArray(documentSources.objectCleanupStatus, [
                    "not_required",
                    "cleanup_failed",
                  ]),
                ),
              );
          }
        }
      });
    },
  };
}

function parseDocumentVersion(value: string): number {
  const normalized = value.startsWith("v") ? value.slice(1) : value;
  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("Invalid document version.");
  }

  return parsed;
}
