import { z } from "zod";

import { isBlockedUrlHost } from "./url-host-policy";

export const queueNameSchema = z.enum(["ingestion", "maintenance"]);

export type QueueName = z.infer<typeof queueNameSchema>;

export const systemJobActorSchema = z.object({
  actorType: z.literal("system"),
  requestedBy: z.null().optional(),
});

export const sourceUrlSchema = z
  .string()
  .url()
  .superRefine((value, context) => {
    const url = new URL(value);

    if (url.protocol !== "https:" && url.protocol !== "http:") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "URL protocol is not allowed",
      });
      return;
    }

    if (isBlockedUrlHost(url.hostname)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "URL host is not allowed",
      });
    }
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
    sourceUrl: sourceUrlSchema,
    requestedBy: z.string().min(1),
  }),
]);

export type IngestionJobPayload = z.infer<typeof ingestionJobPayloadSchema>;
