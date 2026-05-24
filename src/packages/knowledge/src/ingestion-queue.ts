import {
  ingestionJobPayloadSchema,
  type IngestionJobPayload,
} from "@kb/queue";

import type { DocumentFileUploadResult } from "./schemas";

export function createDocumentFileIngestionPayload(input: {
  upload: DocumentFileUploadResult;
  tenantId: string;
  requestedBy: string;
}): Extract<IngestionJobPayload, { type: "file_ingestion" }> {
  const payload = ingestionJobPayloadSchema.parse({
    type: "file_ingestion",
    documentId: input.upload.document.id,
    documentVersion: input.upload.document.currentVersion.toString(),
    ingestionJobId: input.upload.job.id,
    knowledgeBaseId: input.upload.document.knowledgeBaseId,
    requestedBy: input.requestedBy,
    sourceObjectKey: input.upload.source.objectKey,
    tenantId: input.tenantId,
  });
  if (payload.type !== "file_ingestion") {
    throw new Error("Expected file ingestion payload.");
  }

  return payload;
}
