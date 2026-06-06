import { and, asc, eq, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";

import { documents, documentSources } from "@kb/db";

import type {
  DrizzleIngestionRepositoryOptions,
  IngestionCleanupRepository,
} from "../contracts/types";

export function createDrizzleSourceCleanupRepository(
  options: DrizzleIngestionRepositoryOptions,
): IngestionCleanupRepository {
  return {
    async listPendingSourceObjectCleanups(input) {
      const rows = await options.db
        .select({
          id: documentSources.id,
        })
        .from(documentSources)
        .innerJoin(
          documents,
          and(
            eq(documents.tenantId, documentSources.tenantId),
            eq(documents.id, documentSources.documentId),
          ),
        )
        .where(
          and(
            or(
              inArray(documentSources.objectCleanupStatus, [
                "pending_cleanup",
                "cleanup_failed",
              ]),
              and(
                eq(documentSources.objectCleanupStatus, "cleanup_in_progress"),
                lte(documentSources.objectCleanupClaimedAt, input.updatedBefore),
              ),
              and(
                eq(documentSources.objectCleanupStatus, "cleanup_succeeded"),
                isNull(documents.deletedAt),
              ),
            ),
            isNotNull(documentSources.objectKey),
          ),
        )
        .orderBy(asc(documentSources.updatedAt), asc(documentSources.id))
        .limit(input.limit);

      return rows;
    },
    async claimSourceObjectCleanup(input) {
      const rows = await options.db
        .update(documentSources)
        .set({
          objectCleanupClaimToken: input.claimToken,
          objectCleanupClaimedAt: sql`NOW()`,
          objectCleanupErrorCode: null,
          objectCleanupErrorMessage: null,
          objectCleanupStatus: "cleanup_in_progress",
          updatedAt: sql`NOW()`,
        })
        .where(
          and(
            eq(documentSources.id, input.sourceId),
            isNotNull(documentSources.objectKey),
            or(
              inArray(documentSources.objectCleanupStatus, [
                "pending_cleanup",
                "cleanup_failed",
              ]),
              and(
                eq(documentSources.objectCleanupStatus, "cleanup_in_progress"),
                lte(documentSources.objectCleanupClaimedAt, input.updatedBefore),
              ),
              and(
                eq(documentSources.objectCleanupStatus, "cleanup_succeeded"),
                sql`EXISTS (
                  SELECT 1
                  FROM ${documents}
                  WHERE ${documents.tenantId} = ${documentSources.tenantId}
                    AND ${documents.id} = ${documentSources.documentId}
                    AND ${documents.deletedAt} IS NULL
                )`,
              ),
            ),
          ),
        )
        .returning({
          bucket: documentSources.bucket,
          id: documentSources.id,
          objectKey: documentSources.objectKey,
        });

      const row = rows[0];
      if (row === undefined || row.objectKey === null) {
        return null;
      }

      return {
        bucket: row.bucket,
        claimToken: input.claimToken,
        id: row.id,
        objectKey: row.objectKey,
      };
    },
    async completeSourceObjectCleanup(input) {
      await options.db
        .update(documentSources)
        .set({
          objectCleanupClaimToken: null,
          objectCleanupClaimedAt: null,
          objectCleanupErrorCode: null,
          objectCleanupErrorMessage: null,
          objectCleanupStatus: "cleanup_succeeded",
          updatedAt: sql`NOW()`,
        })
        .where(
          and(
            eq(documentSources.id, input.sourceId),
            eq(documentSources.objectCleanupStatus, "cleanup_in_progress"),
            eq(documentSources.objectCleanupClaimToken, input.claimToken),
          ),
        );
    },
    async softDeleteSourceDocumentForCleanup(input) {
      return options.db.transaction(async (tx) => {
        const rows = await tx
          .select({
            documentId: documentSources.documentId,
            tenantId: documentSources.tenantId,
          })
          .from(documentSources)
          .where(
            and(
              eq(documentSources.id, input.sourceId),
              eq(documentSources.objectCleanupStatus, "cleanup_in_progress"),
              eq(documentSources.objectCleanupClaimToken, input.claimToken),
            ),
          )
          .limit(1);
        const row = rows[0];
        if (row === undefined) {
          return false;
        }

        await tx
          .update(documents)
          .set({
            deletedAt: sql`NOW()`,
            updatedAt: sql`NOW()`,
          })
          .where(
            and(
              eq(documents.id, row.documentId),
              eq(documents.tenantId, row.tenantId),
              isNull(documents.deletedAt),
            ),
          );

        await tx
          .update(documentSources)
          .set({
            updatedAt: sql`NOW()`,
            uploadStatus: "upload_failed",
          })
          .where(
            and(
              eq(documentSources.id, input.sourceId),
              eq(documentSources.objectCleanupStatus, "cleanup_in_progress"),
              eq(documentSources.objectCleanupClaimToken, input.claimToken),
            ),
          );

        return true;
      });
    },
    async failSourceObjectCleanup(input) {
      await options.db
        .update(documentSources)
        .set({
          objectCleanupClaimToken: null,
          objectCleanupClaimedAt: null,
          objectCleanupErrorCode: input.errorCode,
          objectCleanupErrorMessage: input.errorMessage,
          objectCleanupStatus: "cleanup_failed",
          updatedAt: sql`NOW()`,
        })
        .where(
          and(
            eq(documentSources.id, input.sourceId),
            eq(documentSources.objectCleanupStatus, "cleanup_in_progress"),
            eq(documentSources.objectCleanupClaimToken, input.claimToken),
          ),
        );
    },
  };
}
