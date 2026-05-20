import type { IngestionJobPayload } from "./schemas";

export function createIngestionJobId(payload: IngestionJobPayload): string {
  return `ingestion:${payload.tenantId}:${payload.documentId}:${payload.documentVersion}`;
}
