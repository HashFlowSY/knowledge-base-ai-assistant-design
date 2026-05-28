import type { EmbeddingServiceResult } from "@kb/ai-providers/service";
import type { ProjectDb } from "@kb/db";
import type { IngestionJobPayload } from "@kb/queue";
import type { IngestionQueueProducer } from "@kb/queue/producer";
import type { SearchIndexDocument } from "@kb/search";
import type { ObjectStorageClient } from "@kb/storage";

import type { ParsedDocument, PersistedIngestionStep } from "./schemas";

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
  claimFileJob(
    payload: Extract<IngestionJobPayload, { type: "file_ingestion" }>,
  ): Promise<ClaimFileJobResult>;
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
