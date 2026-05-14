import { z } from "zod";

export const queueNameSchema = z.enum(["ingestion", "maintenance"]);

export type QueueName = z.infer<typeof queueNameSchema>;

export const systemJobActorSchema = z.object({
  actorType: z.literal("system"),
  requestedBy: z.null().optional(),
});

export const ingestionJobPayloadSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("file_ingestion"),
    tenantId: z.string().min(1),
    knowledgeBaseId: z.string().min(1),
    documentId: z.string().min(1),
    documentVersion: z.string().min(1),
    sourceObjectKey: z.string().min(1),
    requestedBy: z.string().min(1),
  }),
  z.object({
    type: z.literal("url_ingestion"),
    tenantId: z.string().min(1),
    knowledgeBaseId: z.string().min(1),
    documentId: z.string().min(1),
    documentVersion: z.string().min(1),
    sourceUrl: z.string().url(),
    requestedBy: z.string().min(1),
  }),
]);

export type IngestionJobPayload = z.infer<typeof ingestionJobPayloadSchema>;

export function createIngestionJobId(payload: IngestionJobPayload): string {
  return `ingestion:${payload.tenantId}:${payload.documentId}:${payload.documentVersion}`;
}
