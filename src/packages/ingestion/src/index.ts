import { z } from "zod";

export const ingestionStepSchema = z.enum([
  "source",
  "parse",
  "normalize",
  "chunk",
  "embed",
  "index",
]);

export type IngestionStep = z.infer<typeof ingestionStepSchema>;

export const ingestionJobStatusSchema = z.enum([
  "pending",
  "enqueue_failed",
  "processing",
  "succeeded",
  "failed",
]);

export type IngestionJobStatus = z.infer<typeof ingestionJobStatusSchema>;

export const ingestionJobStateSchema = z.object({
  tenantId: z.string().min(1),
  knowledgeBaseId: z.string().min(1),
  documentId: z.string().min(1),
  status: ingestionJobStatusSchema,
  currentStep: ingestionStepSchema.optional(),
});

export type IngestionJobState = z.infer<typeof ingestionJobStateSchema>;
