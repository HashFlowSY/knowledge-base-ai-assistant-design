import { z } from "zod";
import { createHash } from "node:crypto";
import { and, eq, inArray, isNotNull, lte, or, sql } from "drizzle-orm";

import { createSearchIndexDocument, type SearchIndexDocument } from "@kb/search";
import {
  chunkEmbeddings,
  documentChunks,
  documents,
  documentSources,
  ingestionJobLogs,
  ingestionJobs,
  type ProjectDb,
} from "@kb/db";
import type { EmbeddingServiceResult } from "@kb/ai-providers/service";
import type { IngestionJobPayload } from "@kb/queue";
import type { IngestionQueueProducer } from "@kb/queue/producer";
import type { ObjectStorageClient } from "@kb/storage";

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

export class IngestionError extends Error {
  readonly code: IngestionErrorCode;
  readonly retryable: boolean;

  constructor(input: {
    code: IngestionErrorCode;
    message: string;
    retryable: boolean;
  }) {
    super(input.message);
    this.name = "IngestionError";
    this.code = input.code;
    this.retryable = input.retryable;
  }
}

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

export interface PdfTextExtractionResult {
  text: string;
  metadata?: Record<string, unknown>;
  sourcePageCount?: number;
}

export type PdfTextExtractor = (
  body: Uint8Array,
) => Promise<PdfTextExtractionResult>;

export interface ParseDocumentInput {
  body: Uint8Array;
  mimeType?: string | null;
  originalFilename?: string | null;
  pdfTextExtractor?: PdfTextExtractor;
}

export interface ChunkParsedDocumentInput {
  chunkOverlap: number;
  chunkSize: number;
  document: ParsedDocument;
}

export interface DocumentChunkDraft {
  chunkIndex: number;
  content: string;
  contentHash: string;
  tokenEstimate: number;
  sourceLocator: string;
  metadata: Record<string, unknown>;
}

export type PersistedIngestionStep = z.infer<typeof persistedIngestionStepSchema>;

export const persistedIngestionStepSchema = z.enum([
  "source_connector",
  "parser",
  "normalizer",
  "chunker",
  "embedding",
  "index_writer",
]);

export type IngestionStepLogStatus = "started" | "succeeded" | "failed";

export interface FileIngestionJobContext {
  tenantId: string;
  knowledgeBaseId: string;
  documentId: string;
  documentVersion: number;
  ingestionJobId: string;
  requestedBy: string;
  sourceObjectKey: string;
}

export interface FileIngestionSource {
  body: Uint8Array;
  mimeType: string;
  originalFilename: string;
}

export type ClaimFileJobResult =
  | {
      status: "claimed";
      context: FileIngestionJobContext;
    }
  | {
      status: "already_claimed";
    };

export interface IngestionStepLogInput {
  tenantId: string;
  ingestionJobId: string;
  step: PersistedIngestionStep;
  status: IngestionStepLogStatus;
  message: string;
  errorCode?: string;
  metadata: Record<string, unknown>;
}

export interface ChunkEmbeddingDraft {
  chunkIndex: number;
  contentHash: string;
  dimensions: number;
  embedding: number[];
  modelId: string;
  providerId: string | null;
}

export interface PersistIngestionOutputInput {
  context: FileIngestionJobContext;
  chunks: DocumentChunkDraft[];
  embeddings: ChunkEmbeddingDraft[];
}

export interface CompleteIngestionJobInput {
  ingestionJobId: string;
  documentVersion: number;
}

export interface FailIngestionJobInput {
  ingestionJobId: string;
  documentVersion: number;
  errorCode: string;
  errorMessage: string;
  retryable: boolean;
}

export interface IngestionPipelineRepository {
  claimFileJob(payload: Extract<IngestionJobPayload, { type: "file_ingestion" }>): Promise<ClaimFileJobResult>;
  loadFileSource(context: FileIngestionJobContext): Promise<FileIngestionSource>;
  recordStep(input: IngestionStepLogInput): Promise<void>;
  persistIngestionOutput(input: PersistIngestionOutputInput): Promise<void>;
  completeJob(input: CompleteIngestionJobInput): Promise<void>;
  failJob(input: FailIngestionJobInput): Promise<void>;
}

export interface IngestionRecoveryRepository {
  listRecoverableFileJobs(input: {
    limit: number;
    updatedBefore: Date;
  }): Promise<Extract<IngestionJobPayload, { type: "file_ingestion" }>[]>;
}

export interface IngestionEmbeddingService {
  embed(input: {
    tenantId: string;
    inputs: string[];
    requestId: string;
  }): Promise<EmbeddingServiceResult>;
}

export interface IngestionSearchIndexWriter {
  indexDocuments(input: { documents: SearchIndexDocument[] }): Promise<void>;
}

export interface IngestionPipeline {
  processFileIngestion(
    payload: Extract<IngestionJobPayload, { type: "file_ingestion" }>,
  ): Promise<
    | { status: "completed" }
    | { status: "skipped"; reason: "already_claimed" }
    | { status: "failed"; code: string }
  >;
}

export interface IngestionPipelineOptions {
  chunking: {
    chunkSize: number;
    chunkOverlap: number;
  };
  embeddingService: IngestionEmbeddingService;
  indexWriter: IngestionSearchIndexWriter;
  repository: IngestionPipelineRepository;
}

export interface DrizzleIngestionRepositoryOptions {
  db: ProjectDb;
  objectStorage: ObjectStorageClient;
}

export interface IngestionRecoveryOptions {
  producer: IngestionQueueProducer;
  repository: IngestionRecoveryRepository;
  batchSize: number;
  staleAfterMs: number;
  now?: () => Date;
}

const minimumPdfTextCharacters = 5;
const defaultEmbeddingBatchSize = 10;

export async function parseDocument(
  input: ParseDocumentInput,
): Promise<ParsedDocument> {
  const format = detectDocumentFormat(input);

  if (format === "pdf") {
    const extractor = input.pdfTextExtractor ?? defaultPdfTextExtractor;
    const extracted = await extractor(input.body);
    const text = normalizeParsedText(extracted.text);
    if (text.length < minimumPdfTextCharacters) {
      throw new IngestionError({
        code: "PARSE_EMPTY_TEXT",
        message: "PDF did not contain extractable text.",
        retryable: false,
      });
    }

    return parsedDocumentSchema.parse({
      format,
      text,
      metadata: extracted.metadata ?? {},
      ...(extracted.sourcePageCount === undefined
        ? {}
        : { sourcePageCount: extracted.sourcePageCount }),
      ...(input.originalFilename === null || input.originalFilename === undefined
        ? {}
        : { title: input.originalFilename }),
    });
  }

  const text = normalizeParsedText(new TextDecoder("utf-8").decode(input.body));
  return parsedDocumentSchema.parse({
    format,
    text,
    metadata: {},
    ...(input.originalFilename === null || input.originalFilename === undefined
      ? {}
      : { title: input.originalFilename }),
  });
}

export function normalizeParsedText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function chunkParsedDocument(
  input: ChunkParsedDocumentInput,
): Promise<DocumentChunkDraft[]> {
  validateChunkingConfig(input);

  const text = input.document.text;
  const chunks: DocumentChunkDraft[] = [];
  let start = 0;

  while (start < text.length) {
    const hardEnd = Math.min(start + input.chunkSize, text.length);
    const end =
      hardEnd === text.length
        ? hardEnd
        : chooseChunkEnd({
            format: input.document.format,
            hardEnd,
            start,
            text,
          });
    const rawContent = text.slice(start, end);
    const content = rawContent.trim();
    if (content.length > 0) {
      chunks.push({
        chunkIndex: chunks.length,
        content,
        contentHash: sha256Hex(content),
        metadata: {
          format: input.document.format,
          sourceStart: start,
          sourceEnd: end,
        },
        sourceLocator: `chars:${start}-${end}`,
        tokenEstimate: estimateTokens(content),
      });
    }

    if (end >= text.length) {
      break;
    }

    const nextStart = adjustOverlapStart({
      proposedStart: Math.max(0, end - input.chunkOverlap),
      text,
    });
    start = nextStart <= start ? end : nextStart;
  }

  return chunks;
}

export function createIngestionPipeline(
  options: IngestionPipelineOptions,
): IngestionPipeline {
  return {
    async processFileIngestion(payload) {
      const claim = await options.repository.claimFileJob(payload);
      if (claim.status === "already_claimed") {
        return {
          reason: "already_claimed",
          status: "skipped",
        };
      }

      const context = claim.context;

      try {
        await recordStep(options.repository, context, "source_connector", "started");
        const source = await options.repository.loadFileSource(context);
        await recordStep(options.repository, context, "source_connector", "succeeded");

        await recordStep(options.repository, context, "parser", "started");
        const parsed = await parseDocument({
          body: source.body,
          mimeType: source.mimeType,
          originalFilename: source.originalFilename,
        });
        await recordStep(options.repository, context, "parser", "succeeded");

        await recordStep(options.repository, context, "normalizer", "started");
        const normalizedDocument: ParsedDocument = {
          ...parsed,
          text: normalizeParsedText(parsed.text),
        };
        await recordStep(options.repository, context, "normalizer", "succeeded");

        await recordStep(options.repository, context, "chunker", "started");
        const chunks = await chunkParsedDocument({
          chunkOverlap: options.chunking.chunkOverlap,
          chunkSize: options.chunking.chunkSize,
          document: normalizedDocument,
        });
        await recordStep(options.repository, context, "chunker", "succeeded", {
          chunkCount: chunks.length,
        });

        await recordStep(options.repository, context, "embedding", "started");
        const embeddingResult = await embedChunksInBatches({
          chunks,
          embeddingService: options.embeddingService,
          requestId: context.ingestionJobId,
          tenantId: context.tenantId,
        });
        if (!embeddingResult.ok) {
          await failPipelineJob(options.repository, context, {
            code: embeddingResult.code,
            message: embeddingResult.message,
            retryable: embeddingResult.retryable,
            step: "embedding",
          });
          return {
            code: embeddingResult.code,
            status: "failed",
          };
        }
        await recordStep(options.repository, context, "embedding", "succeeded");

        await options.repository.persistIngestionOutput({
          chunks,
          context,
          embeddings: embeddingResult.embeddings,
        });

        await recordStep(options.repository, context, "index_writer", "started");
        await options.indexWriter.indexDocuments({
          documents: chunks.map((chunk) =>
            createSearchIndexDocument({
              chunkId: chunk.contentHash,
              chunkIndex: chunk.chunkIndex,
              content: chunk.content,
              documentId: context.documentId,
              documentVersion: context.documentVersion,
              knowledgeBaseId: context.knowledgeBaseId,
              metadata: chunk.metadata,
              sourceLocator: chunk.sourceLocator,
              tenantId: context.tenantId,
            }),
          ),
        });
        await recordStep(options.repository, context, "index_writer", "succeeded");

        await options.repository.completeJob({
          documentVersion: context.documentVersion,
          ingestionJobId: context.ingestionJobId,
        });

        return { status: "completed" };
      } catch (error) {
        const normalized = normalizePipelineError(error);
        await failPipelineJob(options.repository, context, {
          code: normalized.code,
          message: normalized.message,
          retryable: normalized.retryable,
        });

        return {
          code: normalized.code,
          status: "failed",
        };
      }
    },
  };
}

async function embedChunksInBatches(input: {
  chunks: DocumentChunkDraft[];
  embeddingService: IngestionEmbeddingService;
  requestId: string;
  tenantId: string;
}): Promise<
  | { ok: true; embeddings: ChunkEmbeddingDraft[] }
  | Extract<EmbeddingServiceResult, { ok: false }>
> {
  const embeddings: ChunkEmbeddingDraft[] = [];

  for (
    let startIndex = 0;
    startIndex < input.chunks.length;
    startIndex += defaultEmbeddingBatchSize
  ) {
    const batch = input.chunks.slice(
      startIndex,
      startIndex + defaultEmbeddingBatchSize,
    );
    const batchResult = await input.embeddingService.embed({
      inputs: batch.map((chunk) => chunk.content),
      requestId: input.requestId,
      tenantId: input.tenantId,
    });
    if (!batchResult.ok) {
      return batchResult;
    }

    embeddings.push(
      ...batch.map((chunk, batchIndex) => ({
        chunkIndex: chunk.chunkIndex,
        contentHash: chunk.contentHash,
        dimensions: batchResult.dimensions,
        embedding: batchResult.vectors[batchIndex] ?? [],
        modelId: batchResult.modelId,
        providerId: batchResult.providerConfigId,
      })),
    );
  }

  return {
    embeddings,
    ok: true,
  };
}

export function createDrizzleIngestionRepository(
  options: DrizzleIngestionRepositoryOptions,
): IngestionPipelineRepository & IngestionRecoveryRepository {
  return {
    async claimFileJob(payload) {
      const documentVersion = parseDocumentVersion(payload.documentVersion);
      const rows = await options.db
        .update(ingestionJobs)
        .set({
          attempts: sql`${ingestionJobs.attempts} + 1`,
          currentStep: "source_connector",
          lastErrorCode: null,
          lastErrorMessage: null,
          startedAt: sql`COALESCE(${ingestionJobs.startedAt}, NOW())`,
          status: "running",
          updatedAt: sql`NOW()`,
        })
        .where(
          and(
            eq(ingestionJobs.id, payload.ingestionJobId),
            eq(ingestionJobs.tenantId, payload.tenantId),
            inArray(ingestionJobs.status, ["queued", "retrying"]),
          ),
        )
        .returning({ id: ingestionJobs.id });

      if (rows[0] === undefined) {
        return { status: "already_claimed" };
      }

      return {
        status: "claimed",
        context: {
          documentId: payload.documentId,
          documentVersion,
          ingestionJobId: payload.ingestionJobId,
          knowledgeBaseId: payload.knowledgeBaseId,
          requestedBy: payload.requestedBy,
          sourceObjectKey: payload.sourceObjectKey,
          tenantId: payload.tenantId,
        },
      };
    },
    async loadFileSource(context) {
      const rows = await options.db
        .select({
          bucket: documentSources.bucket,
          mimeType: documentSources.mimeType,
          objectKey: documentSources.objectKey,
          sourceUri: documentSources.sourceUri,
        })
        .from(documentSources)
        .where(
          and(
            eq(documentSources.tenantId, context.tenantId),
            eq(documentSources.documentId, context.documentId),
            eq(documentSources.objectKey, context.sourceObjectKey),
            eq(documentSources.uploadStatus, "available"),
          ),
        )
        .limit(1);
      const source = rows[0];
      if (source === undefined || source.objectKey === null) {
        throw new Error("Ingestion source object is not available.");
      }

      const object = await options.objectStorage.getObject({
        bucket: source.bucket,
        key: source.objectKey,
      });

      return {
        body: object.body,
        mimeType:
          source.mimeType ?? object.contentType ?? "application/octet-stream",
        originalFilename: source.sourceUri,
      };
    },
    async recordStep(input) {
      await options.db.transaction(async (tx) => {
        await tx.insert(ingestionJobLogs).values({
          ...(input.errorCode === undefined ? {} : { errorCode: input.errorCode }),
          jobId: input.ingestionJobId,
          level: input.status === "failed" ? "error" : "info",
          message: input.message,
          metadata: input.metadata,
          step: input.step,
          tenantId: input.tenantId,
        });

        await tx
          .update(ingestionJobs)
          .set({
            currentStep: input.step,
            updatedAt: sql`NOW()`,
          })
          .where(eq(ingestionJobs.id, input.ingestionJobId));
      });
    },
    async persistIngestionOutput(input) {
      await options.db.transaction(async (tx) => {
        const existingChunks = await tx
          .select({ id: documentChunks.id })
          .from(documentChunks)
          .where(
            and(
              eq(documentChunks.tenantId, input.context.tenantId),
              eq(documentChunks.documentId, input.context.documentId),
              eq(documentChunks.documentVersion, input.context.documentVersion),
            ),
          );
        const existingChunkIds = existingChunks.map((chunk) => chunk.id);
        if (existingChunkIds.length > 0) {
          await tx
            .delete(chunkEmbeddings)
            .where(inArray(chunkEmbeddings.chunkId, existingChunkIds));
        }

        await tx
          .delete(documentChunks)
          .where(
            and(
              eq(documentChunks.tenantId, input.context.tenantId),
              eq(documentChunks.documentId, input.context.documentId),
              eq(documentChunks.documentVersion, input.context.documentVersion),
            ),
          );

        if (input.chunks.length === 0) {
          return;
        }

        const insertedChunks = await tx
          .insert(documentChunks)
          .values(
            input.chunks.map((chunk) => ({
              chunkIndex: chunk.chunkIndex,
              content: chunk.content,
              contentHash: chunk.contentHash,
              documentId: input.context.documentId,
              documentVersion: input.context.documentVersion,
              knowledgeBaseId: input.context.knowledgeBaseId,
              metadata: chunk.metadata,
              sourceLocator: chunk.sourceLocator,
              tenantId: input.context.tenantId,
              tokenEstimate: chunk.tokenEstimate,
            })),
          )
          .returning({
            chunkIndex: documentChunks.chunkIndex,
            id: documentChunks.id,
          });
        const chunkIdByIndex = new Map(
          insertedChunks.map((chunk) => [chunk.chunkIndex, chunk.id]),
        );

        await tx.insert(chunkEmbeddings).values(
          input.embeddings.map((embedding) => {
            const chunkId = chunkIdByIndex.get(embedding.chunkIndex);
            if (chunkId === undefined) {
              throw new Error("Chunk insert result missing for embedding.");
            }

            return {
              chunkId,
              contentHash: embedding.contentHash,
              dimensions: embedding.dimensions,
              documentId: input.context.documentId,
              embedding: embedding.embedding,
              knowledgeBaseId: input.context.knowledgeBaseId,
              modelId: embedding.modelId,
              providerId: embedding.providerId,
              tenantId: input.context.tenantId,
            };
          }),
        );
      });
    },
    async completeJob(input) {
      await options.db.transaction(async (tx) => {
        await tx
          .update(ingestionJobs)
          .set({
            currentStep: "index_writer",
            finishedAt: sql`NOW()`,
            lastErrorCode: null,
            lastErrorMessage: null,
            status: "completed",
            updatedAt: sql`NOW()`,
          })
          .where(eq(ingestionJobs.id, input.ingestionJobId));

        const rows = await tx
          .select({ documentId: ingestionJobs.documentId })
          .from(ingestionJobs)
          .where(eq(ingestionJobs.id, input.ingestionJobId))
          .limit(1);
        const row = rows[0];
        if (row !== undefined) {
          await tx
            .update(documents)
            .set({
              status: "ready",
              updatedAt: sql`NOW()`,
            })
            .where(
              and(
                eq(documents.id, row.documentId),
                eq(documents.currentVersion, input.documentVersion),
              ),
            );
        }
      });
    },
    async failJob(input) {
      await options.db.transaction(async (tx) => {
        await tx
          .update(ingestionJobs)
          .set({
            finishedAt: input.retryable ? null : sql`NOW()`,
            lastErrorCode: input.errorCode,
            lastErrorMessage: input.errorMessage,
            status: input.retryable ? "retrying" : "failed",
            updatedAt: sql`NOW()`,
          })
          .where(eq(ingestionJobs.id, input.ingestionJobId));

        const rows = await tx
          .select({ documentId: ingestionJobs.documentId })
          .from(ingestionJobs)
          .where(eq(ingestionJobs.id, input.ingestionJobId))
          .limit(1);
        const row = rows[0];
        if (row !== undefined) {
          await tx
            .update(documents)
            .set({
              status: "failed",
              updatedAt: sql`NOW()`,
            })
            .where(
              and(
                eq(documents.id, row.documentId),
                eq(documents.currentVersion, input.documentVersion),
              ),
            );
        }
      });
    },
    async listRecoverableFileJobs(input) {
      const rows = await options.db
        .select({
          documentId: ingestionJobs.documentId,
          documentVersion: documents.currentVersion,
          ingestionJobId: ingestionJobs.id,
          knowledgeBaseId: ingestionJobs.knowledgeBaseId,
          objectKey: documentSources.objectKey,
          requestedByUserId: ingestionJobs.requestedByUserId,
          tenantId: ingestionJobs.tenantId,
        })
        .from(ingestionJobs)
        .innerJoin(
          documents,
          and(
            eq(documents.tenantId, ingestionJobs.tenantId),
            eq(documents.id, ingestionJobs.documentId),
          ),
        )
        .innerJoin(
          documentSources,
          and(
            eq(documentSources.tenantId, ingestionJobs.tenantId),
            eq(documentSources.documentId, ingestionJobs.documentId),
            eq(documentSources.sourceHash, ingestionJobs.sourceHash),
            eq(documentSources.uploadStatus, "available"),
            isNotNull(documentSources.objectKey),
          ),
        )
        .where(
          and(
            eq(ingestionJobs.sourceType, "file"),
            lte(ingestionJobs.updatedAt, input.updatedBefore),
            or(
              inArray(ingestionJobs.status, ["queued", "retrying"]),
              and(
                eq(ingestionJobs.status, "failed"),
                eq(ingestionJobs.lastErrorCode, "QUEUE_ENQUEUE_FAILED"),
              ),
            ),
          ),
        )
        .limit(input.limit);

      return rows.map((row) => ({
        type: "file_ingestion" as const,
        documentId: row.documentId,
        documentVersion: row.documentVersion.toString(),
        ingestionJobId: row.ingestionJobId,
        knowledgeBaseId: row.knowledgeBaseId,
        requestedBy: row.requestedByUserId ?? "system",
        sourceObjectKey: row.objectKey ?? "",
        tenantId: row.tenantId,
      }));
    },
  };
}

export async function recoverIngestionJobs(
  options: IngestionRecoveryOptions,
): Promise<{ enqueued: number }> {
  const now = options.now ?? (() => new Date());
  const updatedBefore = new Date(now().getTime() - options.staleAfterMs);
  const payloads = await options.repository.listRecoverableFileJobs({
    limit: options.batchSize,
    updatedBefore,
  });

  for (const payload of payloads) {
    await options.producer.enqueue(payload);
  }

  return {
    enqueued: payloads.length,
  };
}

async function recordStep(
  repository: IngestionPipelineRepository,
  context: FileIngestionJobContext,
  step: PersistedIngestionStep,
  status: IngestionStepLogStatus,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await repository.recordStep({
    ingestionJobId: context.ingestionJobId,
    message: `${step}.${status}`,
    metadata,
    status,
    step,
    tenantId: context.tenantId,
  });
}

async function failPipelineJob(
  repository: IngestionPipelineRepository,
  context: FileIngestionJobContext,
  input: {
    code: string;
    message: string;
    retryable: boolean;
    step?: PersistedIngestionStep;
  },
): Promise<void> {
  if (input.step !== undefined) {
    await repository.recordStep({
      errorCode: input.code,
      ingestionJobId: context.ingestionJobId,
      message: input.message,
      metadata: {
        retryable: input.retryable,
      },
      status: "failed",
      step: input.step,
      tenantId: context.tenantId,
    });
  }

  await repository.failJob({
    documentVersion: context.documentVersion,
    errorCode: input.code,
    errorMessage: input.message,
    ingestionJobId: context.ingestionJobId,
    retryable: input.retryable,
  });
}

function normalizePipelineError(error: unknown): {
  code: string;
  message: string;
  retryable: boolean;
} {
  if (error instanceof IngestionError) {
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
    };
  }

  if (error instanceof Error) {
    return {
      code: "INGESTION_FAILED",
      message: error.message,
      retryable: true,
    };
  }

  return {
    code: "INGESTION_FAILED",
    message: String(error),
    retryable: true,
  };
}

function parseDocumentVersion(value: string): number {
  const normalized = value.startsWith("v") ? value.slice(1) : value;
  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("Invalid document version.");
  }

  return parsed;
}

function adjustOverlapStart(input: {
  proposedStart: number;
  text: string;
}): number {
  if (input.proposedStart <= 0) {
    return 0;
  }

  const searchFloor = Math.max(0, input.proposedStart - 24);
  for (let index = input.proposedStart; index >= searchFloor; index -= 1) {
    if (/\s/.test(input.text.charAt(index - 1))) {
      return index;
    }
  }

  return input.proposedStart;
}

function detectDocumentFormat(input: ParseDocumentInput): ParsedDocumentFormat {
  const mimeType = input.mimeType?.toLowerCase() ?? "";
  const filename = input.originalFilename?.toLowerCase() ?? "";

  if (mimeType === "application/pdf" || filename.endsWith(".pdf")) {
    return "pdf";
  }

  if (
    mimeType === "text/markdown" ||
    mimeType === "text/x-markdown" ||
    filename.endsWith(".md") ||
    filename.endsWith(".markdown")
  ) {
    return "markdown";
  }

  if (mimeType === "text/plain" || filename.endsWith(".txt")) {
    return "txt";
  }

  throw new IngestionError({
    code: "UNSUPPORTED_DOCUMENT_TYPE",
    message: "Document type is not supported by ingestion.",
    retryable: false,
  });
}

async function defaultPdfTextExtractor(
  body: Uint8Array,
): Promise<PdfTextExtractionResult> {
  const module = (await import("pdf-parse")) as unknown;
  const pdfParse = resolvePdfParseFunction(module);
  const result = await pdfParse(Buffer.from(body));

  return {
    ...(result.metadata === undefined ? {} : { metadata: result.metadata }),
    ...(result.sourcePageCount === undefined
      ? {}
      : { sourcePageCount: result.sourcePageCount }),
    text: result.text,
  };
}

interface PdfParseResult {
  text: string;
  sourcePageCount?: number;
  metadata?: Record<string, unknown>;
}

interface PdfParseV2Instance {
  getText(): Promise<{
    text: string;
    total?: number;
    metadata?: Record<string, unknown>;
  }>;
  destroy(): Promise<void> | void;
}

function resolvePdfParseFunction(
  module: unknown,
): (body: Uint8Array) => Promise<PdfParseResult> {
  if (typeof module === "function") {
    return async (body) => normalizePdfParseResult(await module(body));
  }

  if (
    typeof module === "object" &&
    module !== null &&
    "default" in module &&
    typeof module.default === "function"
  ) {
    const parser = module.default;
    return async (body) => normalizePdfParseResult(await parser(body));
  }

  if (
    typeof module === "object" &&
    module !== null &&
    "PDFParse" in module &&
    typeof module.PDFParse === "function"
  ) {
    const PDFParse = module.PDFParse as new (input: {
      data: Uint8Array;
    }) => PdfParseV2Instance;
    return async (body) => {
      const parser = new PDFParse({ data: body });
      try {
        const result = await parser.getText();
        return {
          ...(result.metadata === undefined ? {} : { metadata: result.metadata }),
          ...(result.total === undefined ? {} : { sourcePageCount: result.total }),
          text: result.text,
        };
      } finally {
        await parser.destroy();
      }
    };
  }

  throw new IngestionError({
    code: "UNSUPPORTED_DOCUMENT_TYPE",
    message: "PDF parser is unavailable.",
    retryable: true,
  });
}

function normalizePdfParseResult(value: unknown): PdfParseResult {
  if (typeof value !== "object" || value === null || !("text" in value)) {
    throw new IngestionError({
      code: "UNSUPPORTED_DOCUMENT_TYPE",
      message: "PDF parser returned an invalid result.",
      retryable: true,
    });
  }

  const result = value as {
    text: unknown;
    numpages?: unknown;
    total?: unknown;
    metadata?: unknown;
  };
  if (typeof result.text !== "string") {
    throw new IngestionError({
      code: "UNSUPPORTED_DOCUMENT_TYPE",
      message: "PDF parser returned an invalid result.",
      retryable: true,
    });
  }

  const sourcePageCount =
    typeof result.numpages === "number"
      ? result.numpages
      : typeof result.total === "number"
        ? result.total
        : undefined;

  return {
    ...(isRecord(result.metadata) ? { metadata: result.metadata } : {}),
    ...(sourcePageCount === undefined ? {} : { sourcePageCount }),
    text: result.text,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateChunkingConfig(input: ChunkParsedDocumentInput): void {
  if (
    !Number.isInteger(input.chunkSize) ||
    input.chunkSize <= 0 ||
    !Number.isInteger(input.chunkOverlap) ||
    input.chunkOverlap < 0 ||
    input.chunkOverlap >= input.chunkSize
  ) {
    throw new IngestionError({
      code: "INVALID_CHUNKING_CONFIG",
      message: "Chunk size and overlap are invalid.",
      retryable: false,
    });
  }
}

function chooseChunkEnd(input: {
  format: ParsedDocumentFormat;
  hardEnd: number;
  start: number;
  text: string;
}): number {
  const minimumSoftEnd = input.start + Math.floor((input.hardEnd - input.start) * 0.5);
  const boundaries = collectBoundaries(input.text, input.format).filter(
    (boundary) => boundary > minimumSoftEnd && boundary <= input.hardEnd,
  );
  const structuralBoundary = boundaries.at(-1);
  if (structuralBoundary !== undefined) {
    return structuralBoundary;
  }

  const wordBoundary = findLastWordBoundary({
    hardEnd: input.hardEnd,
    minimumSoftEnd,
    text: input.text,
  });

  return wordBoundary ?? input.hardEnd;
}

function collectBoundaries(
  text: string,
  format: ParsedDocumentFormat,
): number[] {
  const boundaries = new Set<number>();
  const structuralPattern =
    format === "markdown"
      ? /(?:\n{2,})|(?:\n(?=#{1,6}\s))|(?:\n(?=\s*[-*+]\s))|(?:\n(?=\s*\d+\.\s))/g
      : /\n{2,}|[.!?。！？]\s+/g;
  let match: RegExpExecArray | null;

  while ((match = structuralPattern.exec(text)) !== null) {
    boundaries.add(match.index + match[0].length);
  }

  return Array.from(boundaries).sort((left, right) => left - right);
}

function findLastWordBoundary(input: {
  hardEnd: number;
  minimumSoftEnd: number;
  text: string;
}): number | null {
  for (let index = input.hardEnd; index > input.minimumSoftEnd; index -= 1) {
    if (/\s/.test(input.text.charAt(index))) {
      return index;
    }
  }

  return null;
}

function estimateTokens(content: string): number {
  return Math.max(1, Math.ceil(content.length / 4));
}

function sha256Hex(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}
