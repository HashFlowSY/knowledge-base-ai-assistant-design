import { z } from "zod";

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("api"),
  timestamp: z.string().datetime(),
  requestId: z.string().min(1),
  dependencies: z.object({
    config: z.literal("not_checked"),
    database: z.literal("not_checked"),
    redis: z.literal("not_checked"),
    meilisearch: z.literal("not_checked"),
    objectStorage: z.literal("not_checked"),
  }),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
