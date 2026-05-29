import { sql } from "drizzle-orm";

import {
  documents,
  documentSources,
  ingestionJobs,
  type ProjectDb,
} from "@kb/db";
import { createDocumentObjectKey } from "@kb/storage";

import { documentVersion } from "../shared/constants";
import type { ReservedUpload, UploadInput } from "../shared/types";

export async function reserveUploadMetadata(
  db: ProjectDb,
  sourceBucket: string,
  input: UploadInput,
): Promise<ReservedUpload> {
  return db.transaction(async (tx) => {
    const documentRows = await tx
      .insert(documents)
      .values({
        createdByUserId: input.actor.user.id,
        currentVersion: documentVersion,
        knowledgeBaseId: input.knowledgeBaseId,
        metadata: {
          originalFilename: input.originalFilename,
          sourceHash: input.checksum,
        },
        status: "pending",
        tenantId: input.actor.tenant.id,
        title: input.title,
        updatedAt: sql`NOW()`,
      })
      .returning({ id: documents.id });
    const documentRow = documentRows[0];
    if (documentRow === undefined) {
      throw new Error("Document reservation failed.");
    }

    const objectKey = createDocumentObjectKey({
      documentId: documentRow.id,
      documentVersion,
      fileName: input.originalFilename,
      knowledgeBaseId: input.knowledgeBaseId,
      tenantId: input.actor.tenant.id,
    });

    const sourceRows = await tx
      .insert(documentSources)
      .values({
        bucket: sourceBucket,
        documentId: documentRow.id,
        knowledgeBaseId: input.knowledgeBaseId,
        metadata: {
          documentVersion,
          originalFilename: input.originalFilename,
          requestId: input.requestId,
        },
        mimeType: input.mimeType,
        objectCleanupStatus: "not_required",
        objectKey,
        scanStatus: "not_scanned",
        sizeBytes: input.sizeBytes,
        sourceHash: input.checksum,
        sourceType: "file",
        sourceUri: input.originalFilename,
        tenantId: input.actor.tenant.id,
        uploadStatus: "pending_upload",
      })
      .returning({ id: documentSources.id });
    const sourceRow = sourceRows[0];
    if (sourceRow === undefined) {
      throw new Error("Source reservation failed.");
    }

    const jobRows = await tx
      .insert(ingestionJobs)
      .values({
        documentId: documentRow.id,
        knowledgeBaseId: input.knowledgeBaseId,
        metadata: {
          bucket: sourceBucket,
          documentVersion,
          objectKey,
          sourceId: sourceRow.id,
        },
        requestedByUserId: input.actor.user.id,
        sourceHash: input.checksum,
        sourceType: "file",
        status: "pending_source",
        tenantId: input.actor.tenant.id,
        updatedAt: sql`NOW()`,
      })
      .returning({ id: ingestionJobs.id });
    const jobRow = jobRows[0];
    if (jobRow === undefined) {
      throw new Error("Ingestion job reservation failed.");
    }

    return {
      documentId: documentRow.id,
      jobId: jobRow.id,
      objectKey,
      sourceId: sourceRow.id,
    };
  });
}
