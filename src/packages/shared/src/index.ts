import { z } from "zod";

export const serviceNameSchema = z.enum(["web", "api", "worker"]);

export type ServiceName = z.infer<typeof serviceNameSchema>;

export const isoTimestampSchema = z.string().datetime();

export type IsoTimestamp = z.infer<typeof isoTimestampSchema>;

export const apiErrorResponseSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  requestId: z.string().min(1),
  validationErrors: z
    .array(
      z.object({
        path: z.array(z.union([z.string(), z.number()])),
        message: z.string().min(1),
      }),
    )
    .optional(),
});

export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;

export function createUtcTimestamp(now: Date = new Date()): IsoTimestamp {
  return isoTimestampSchema.parse(now.toISOString());
}
