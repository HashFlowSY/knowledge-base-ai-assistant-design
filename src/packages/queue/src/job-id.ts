import type { IngestionJobPayload } from "./schemas";

export function createIngestionJobId(payload: IngestionJobPayload): string {
  return [
    "ingestion",
    encodeJobIdComponent(payload.tenantId),
    encodeJobIdComponent(payload.documentId),
    encodeJobIdComponent(payload.documentVersion),
  ].join("__");
}

function encodeJobIdComponent(value: string): string {
  return encodeURIComponent(value);
}
