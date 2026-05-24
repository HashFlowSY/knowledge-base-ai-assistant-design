import { describe, expect, it } from "vitest";

import {
  chunkParsedDocument,
  createIngestionPipeline,
  IngestionError,
  ingestionJobStateSchema,
  normalizeParsedText,
  parseDocument,
  type FileIngestionSource,
  type IngestionPipelineRepository,
  type IngestionStepLogInput,
  type PersistIngestionOutputInput,
} from "./index";

describe("@kb/ingestion", () => {
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

  it("chunks Markdown by preferring headings and paragraph boundaries", async () => {
    const parsed = await parseDocument({
      body: new TextEncoder().encode(
        "# Intro\n\nThis paragraph explains the upload pipeline.\n\n## Details\n\n- Parse files\n- Chunk text\n- Embed chunks",
      ),
      mimeType: "text/markdown",
      originalFilename: "notes.md",
    });

    const chunks = await chunkParsedDocument({
      chunkOverlap: 10,
      chunkSize: 60,
      document: parsed,
    });

    expect(chunks.map((chunk) => chunk.content)).toEqual([
      "# Intro\n\nThis paragraph explains the upload pipeline.",
      "pipeline.\n\n## Details\n\n- Parse files\n- Chunk text",
      "Chunk text\n- Embed chunks",
    ]);
    expect(chunks.map((chunk) => chunk.chunkIndex)).toEqual([0, 1, 2]);
    expect(chunks.every((chunk) => chunk.contentHash.length === 64)).toBe(true);
  });

  it("chunks TXT by preferring paragraph and sentence boundaries", async () => {
    const parsed = await parseDocument({
      body: new TextEncoder().encode(
        "First sentence. Second sentence stays nearby.\n\nA new paragraph should start cleanly when possible.",
      ),
      mimeType: "text/plain",
      originalFilename: "notes.txt",
    });

    const chunks = await chunkParsedDocument({
      chunkOverlap: 8,
      chunkSize: 55,
      document: parsed,
    });

    expect(chunks.map((chunk) => chunk.content)).toEqual([
      "First sentence. Second sentence stays nearby.",
      "nearby.\n\nA new paragraph should start cleanly when",
      "cleanly when possible.",
    ]);
  });

  it("falls back to hard character limits with overlap for long unbroken text", async () => {
    const parsed = await parseDocument({
      body: new TextEncoder().encode("abcdefghijklmnopqrstuvwxyz"),
      mimeType: "text/plain",
      originalFilename: "letters.txt",
    });

    const chunks = await chunkParsedDocument({
      chunkOverlap: 4,
      chunkSize: 10,
      document: parsed,
    });

    expect(chunks.map((chunk) => chunk.content)).toEqual([
      "abcdefghij",
      "ghijklmnop",
      "mnopqrstuv",
      "stuvwxyz",
    ]);
  });

  it("normalizes line endings and excessive blank lines deterministically", () => {
    expect(normalizeParsedText("One\r\n\r\n\r\nTwo\rThree  \n")).toBe(
      "One\n\nTwo\nThree",
    );
  });

  it("fails empty text-layer PDFs without falling back to OCR", async () => {
    await expect(
      parseDocument({
        body: new Uint8Array([37, 80, 68, 70]),
        mimeType: "application/pdf",
        originalFilename: "scan.pdf",
        pdfTextExtractor: async () => ({
          sourcePageCount: 2,
          text: "   \n",
        }),
      }),
    ).rejects.toMatchObject({
      code: "PARSE_EMPTY_TEXT",
      retryable: false,
    });
  });

  it("extracts text-layer PDFs with the bundled pdf parser", async () => {
    const parsed = await parseDocument({
      body: new TextEncoder().encode(textLayerPdfFixture),
      mimeType: "application/pdf",
      originalFilename: "text-layer.pdf",
    });

    expect(parsed.format).toBe("pdf");
    expect(parsed.text).toContain("Hello PDF text");
    expect(parsed.sourcePageCount).toBe(1);
  });

  it("rejects unsupported document types before expensive parsing", async () => {
    await expect(
      parseDocument({
        body: new TextEncoder().encode("<html></html>"),
        mimeType: "text/html",
        originalFilename: "source.html",
      }),
    ).rejects.toBeInstanceOf(IngestionError);
    await expect(
      parseDocument({
        body: new TextEncoder().encode("<html></html>"),
        mimeType: "text/html",
        originalFilename: "source.html",
      }),
    ).rejects.toMatchObject({
      code: "UNSUPPORTED_DOCUMENT_TYPE",
      retryable: false,
    });
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

const textLayerPdfFixture = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>
endobj
4 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
5 0 obj
<< /Length 44 >>
stream
BT /F1 24 Tf 72 720 Td (Hello PDF text) Tj ET
endstream
endobj
xref
0 6
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000241 00000 n
0000000311 00000 n
trailer
<< /Size 6 /Root 1 0 R >>
startxref
405
%%EOF`;

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
