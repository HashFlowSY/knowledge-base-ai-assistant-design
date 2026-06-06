import { and, eq } from "drizzle-orm";

import { documentSources } from "@kb/db";

import type {
  DrizzleIngestionRepositoryOptions,
  IngestionPipelineRepository,
} from "../contracts/types";

type DrizzleFileSourceRepository = Pick<IngestionPipelineRepository, "loadFileSource">;

export function createDrizzleFileSourceRepository(
  options: DrizzleIngestionRepositoryOptions,
): DrizzleFileSourceRepository {
  return {
    async loadFileSource(context) {
      const rows = await options.db
        .select({
          bucket: documentSources.bucket,
          mimeType: documentSources.mimeType,
          objectKey: documentSources.objectKey,
          sourceUri: documentSources.sourceUri,
        })
        .from(documentSources)
        .where(
          and(
            eq(documentSources.tenantId, context.tenantId),
            eq(documentSources.documentId, context.documentId),
            eq(documentSources.objectKey, context.sourceObjectKey),
            eq(documentSources.uploadStatus, "available"),
          ),
        )
        .limit(1);
      const source = rows[0];
      if (source === undefined || source.objectKey === null) {
        throw new Error("Ingestion source object is not available.");
      }

      const object = await options.objectStorage.getObject({
        bucket: source.bucket,
        key: source.objectKey,
      });

      return {
        body: object.body,
        mimeType: source.mimeType ?? object.contentType ?? "application/octet-stream",
        originalFilename: source.sourceUri,
      };
    },
  };
}
