import { describe, expect, it } from "vitest";

import {
  createIngestionPipeline,
  ingestionJobStateSchema,
  type FileIngestionSource,
  type IngestionPipelineRepository,
  type IngestionStepLogInput,
  type PersistIngestionOutputInput,
} from "../index";

describe("@kb/ingestion pipeline", () => {
  it("tracks persisted job state identifiers and current step", () => {
    expect(
      ingestionJobStateSchema.parse({
        tenantId: "tenant_1",
        knowledgeBaseId: "kb_1",
        documentId: "doc_1",
        status: "processing",
        currentStep: "chunk",
      }).currentStep,
    ).toBe("chunk");
  });

  it("processes file ingestion through parse, chunk, embed, persist, and index", async () => {
    const repository = createFakeRepository({
      source: {
        body: new TextEncoder().encode("# Intro\n\nThis document is ready."),
        mimeType: "text/markdown",
        originalFilename: "ready.md",
      },
    });
    const indexedDocumentIds: string[] = [];
    const pipeline = createIngestionPipeline({
      chunking: {
        chunkOverlap: 10,
        chunkSize: 100,
      },
      embeddingService: {
        async embed(input) {
          expect(input.inputs).toEqual(["# Intro\n\nThis document is ready."]);
          return {
            ok: true,
            dimensions: 1_024,
            modelId: "text-embedding-v4",
            provider: "openai-compatible",
            providerConfigId: "provider_1",
            vectors: [createVector(0.3)],
          };
        },
      },
      indexWriter: {
        async indexDocuments(input) {
          indexedDocumentIds.push(...input.documents.map((document) => document.id));
        },
      },
      repository,
    });

    await expect(pipeline.processFileIngestion(filePayload())).resolves.toEqual({
      status: "completed",
    });
    expect(repository.persisted?.chunks).toHaveLength(1);
    expect(repository.persisted?.embeddings).toMatchObject([
      {
        dimensions: 1_024,
        modelId: "text-embedding-v4",
        providerId: "provider_1",
      },
    ]);
    expect(indexedDocumentIds).toEqual(["tenant_1__kb_1__doc_1__1__0"]);
    expect(repository.completed).toEqual({
      documentVersion: 1,
      ingestionJobId: "job_1",
    });
    expect(repository.logs.map((log) => `${log.step}:${log.status}`)).toEqual([
      "source_connector:started",
      "source_connector:succeeded",
      "parser:started",
      "parser:succeeded",
      "normalizer:started",
      "normalizer:succeeded",
      "chunker:started",
      "chunker:succeeded",
      "embedding:started",
      "embedding:succeeded",
      "index_writer:started",
      "index_writer:succeeded",
    ]);
  });

  it("batches embedding requests before persisting large chunk sets", async () => {
    const sourceText = Array.from({ length: 23 }, (_, index) =>
      index.toString().padStart(2, "0").repeat(5),
    ).join("");
    const repository = createFakeRepository({
      source: {
        body: new TextEncoder().encode(sourceText),
        mimeType: "text/plain",
        originalFilename: "large.txt",
      },
    });
    const batchSizes: number[] = [];
    const pipeline = createIngestionPipeline({
      chunking: {
        chunkOverlap: 0,
        chunkSize: 10,
      },
      embeddingService: {
        async embed(input) {
          batchSizes.push(input.inputs.length);
          return {
            ok: true,
            dimensions: 1_024,
            modelId: "text-embedding-v4",
            provider: "openai-compatible",
            providerConfigId: "provider_1",
            vectors: input.inputs.map((_, index) => createVector(index)),
          };
        },
      },
      indexWriter: {
        async indexDocuments() {
          return undefined;
        },
      },
      repository,
    });

    await expect(pipeline.processFileIngestion(filePayload())).resolves.toEqual({
      status: "completed",
    });
    expect(batchSizes).toEqual([10, 10, 3]);
    expect(repository.persisted?.chunks).toHaveLength(23);
    expect(repository.persisted?.embeddings).toHaveLength(23);
  });

  it("skips duplicate BullMQ deliveries that cannot claim the persisted job", async () => {
    const repository = createFakeRepository({
      claimResult: { status: "already_claimed" },
    });
    const pipeline = createIngestionPipeline({
      chunking: {
        chunkOverlap: 10,
        chunkSize: 100,
      },
      embeddingService: {
        async embed() {
          throw new Error("should not embed duplicate deliveries");
        },
      },
      indexWriter: {
        async indexDocuments() {
          throw new Error("should not index duplicate deliveries");
        },
      },
      repository,
    });

    await expect(pipeline.processFileIngestion(filePayload())).resolves.toEqual({
      status: "skipped",
      reason: "already_claimed",
    });
    expect(repository.logs).toEqual([]);
  });

  it("fails the job when the embedding provider is not configured", async () => {
    const repository = createFakeRepository({
      source: {
        body: new TextEncoder().encode("A document that cannot be embedded."),
        mimeType: "text/plain",
        originalFilename: "missing-provider.txt",
      },
    });
    const pipeline = createIngestionPipeline({
      chunking: {
        chunkOverlap: 5,
        chunkSize: 80,
      },
      embeddingService: {
        async embed() {
          return {
            ok: false,
            code: "EMBEDDING_PROVIDER_NOT_CONFIGURED",
            message: "未配置可用的向量模型服务。",
            retryable: true,
          };
        },
      },
      indexWriter: {
        async indexDocuments() {
          throw new Error("failed embedding must not be indexed");
        },
      },
      repository,
    });

    await expect(pipeline.processFileIngestion(filePayload())).resolves.toEqual({
      status: "failed",
      code: "EMBEDDING_PROVIDER_NOT_CONFIGURED",
    });
    expect(repository.persisted).toBeNull();
    expect(repository.failed).toMatchObject({
      documentVersion: 1,
      errorCode: "EMBEDDING_PROVIDER_NOT_CONFIGURED",
      ingestionJobId: "job_1",
      retryable: true,
    });
  });
});

function filePayload() {
  return {
    type: "file_ingestion" as const,
    ingestionJobId: "job_1",
    tenantId: "tenant_1",
    knowledgeBaseId: "kb_1",
    documentId: "doc_1",
    documentVersion: "1",
    sourceObjectKey: "tenants/tenant_1/source.txt",
    requestedBy: "user_1",
  };
}

function createVector(value: number): number[] {
  return Array.from({ length: 1_024 }, () => value);
}

function createFakeRepository(input: {
  claimResult?: Awaited<ReturnType<IngestionPipelineRepository["claimFileJob"]>>;
  source?: FileIngestionSource;
}): IngestionPipelineRepository & {
  completed: { ingestionJobId: string; documentVersion: number } | null;
  failed:
    | {
        documentVersion: number;
        errorCode: string;
        ingestionJobId: string;
        retryable: boolean;
      }
    | null;
  logs: IngestionStepLogInput[];
  persisted: PersistIngestionOutputInput | null;
} {
  const logs: IngestionStepLogInput[] = [];
  return {
    completed: null,
    failed: null,
    logs,
    persisted: null,
    async claimFileJob(payload) {
      return (
        input.claimResult ?? {
          status: "claimed",
          context: {
            documentId: payload.documentId,
            documentVersion: Number(payload.documentVersion),
            ingestionJobId: payload.ingestionJobId,
            knowledgeBaseId: payload.knowledgeBaseId,
            requestedBy: payload.requestedBy,
            sourceObjectKey: payload.sourceObjectKey,
            tenantId: payload.tenantId,
          },
        }
      );
    },
    async completeJob(completeInput) {
      this.completed = completeInput;
    },
    async failJob(failInput) {
      this.failed = failInput;
    },
    async loadFileSource() {
      return (
        input.source ?? {
          body: new TextEncoder().encode("default source"),
          mimeType: "text/plain",
          originalFilename: "source.txt",
        }
      );
    },
    async persistIngestionOutput(persistInput) {
      this.persisted = persistInput;
    },
    async recordStep(logInput) {
      logs.push(logInput);
    },
  };
}
