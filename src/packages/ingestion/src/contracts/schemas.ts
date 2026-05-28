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

export const ingestionErrorCodeSchema = z.enum([
  "UNSUPPORTED_DOCUMENT_TYPE",
  "PARSE_EMPTY_TEXT",
  "INVALID_CHUNKING_CONFIG",
]);

export type IngestionErrorCode = z.infer<typeof ingestionErrorCodeSchema>;

export const parsedDocumentFormatSchema = z.enum(["pdf", "markdown", "txt"]);

export type ParsedDocumentFormat = z.infer<typeof parsedDocumentFormatSchema>;

export const parsedDocumentSchema = z.object({
  format: parsedDocumentFormatSchema,
  text: z.string().min(1),
  title: z.string().min(1).optional(),
  metadata: z.record(z.unknown()),
  sourcePageCount: z.number().int().positive().optional(),
});

export type ParsedDocument = z.infer<typeof parsedDocumentSchema>;

export const persistedIngestionStepSchema = z.enum([
  "source_connector",
  "parser",
  "normalizer",
  "chunker",
  "embedding",
  "index_writer",
]);

export type PersistedIngestionStep = z.infer<
  typeof persistedIngestionStepSchema
>;
