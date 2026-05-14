# RAG and Ingestion Guidelines

These rules define the core knowledge ingestion and retrieval pipeline.

## Package Ownership

- `src/packages/ingestion` owns ingestion pipeline orchestration.
- `src/packages/rag` owns query-time retrieval, fusion, rerank, citation assembly, and feedback recording.
- `src/packages/ai-providers` owns provider calls for embedding, rerank, and chat.
- `src/packages/search` owns Meilisearch indexing/search helpers.
- `src/packages/storage` owns file/object access.
- `src/packages/knowledge` owns knowledge base, document, source, and permission domain rules.

## Ingestion Pipeline

The ingestion pipeline has fixed steps:

1. Source connector.
2. Parser.
3. Normalizer.
4. Chunker.
5. Embedding.
6. Index writer.

Each step must:

- Accept a typed input object.
- Return a typed result object.
- Record step status.
- Avoid leaking full content into logs.
- Be retry-safe for the same document version.

## Source Connectors

Initial connectors:

- File upload.
- Web URL.

Connector output:

```typescript
type SourcePayload = {
  tenantId: string;
  knowledgeBaseId: string;
  documentId: string;
  sourceType: "file" | "url";
  sourceUri: string;
  mimeType?: string;
  sizeBytes?: number;
  checksum?: string;
};
```

Future connectors such as Notion, Confluence, Google Drive, and Slack must implement the same connector boundary without changing downstream parser/chunker contracts.

## Parsers

Initial parsers:

- PDF.
- Markdown.
- TXT.
- HTML/URL.

Parser output:

```typescript
type ParsedDocument = {
  title?: string;
  text: string;
  metadata: Record<string, unknown>;
  sourcePageCount?: number;
};
```

Parsers must reject unsupported or suspicious content types before expensive processing.

## Normalization

Normalization must:

- Normalize line endings.
- Trim excessive whitespace.
- Preserve meaningful headings.
- Preserve source location metadata where available.
- Produce deterministic output for the same source.

Normalized output should include text and metadata needed for citations.

## Chunking

Chunking must produce stable chunk order and source references.

Chunk record fields:

- `tenantId`
- `knowledgeBaseId`
- `documentId`
- `chunkIndex`
- `content`
- `contentHash`
- `tokenEstimate`
- `sourceLocator`
- `metadata`

Chunk size and overlap must be configuration-driven. Defaults should favor citation quality over maximum compression.

## Embedding

Embedding step uses the configured embedding provider, defaulting to Tongyi/Bailian.

Rules:

- Batch embedding requests when supported.
- Limit provider concurrency.
- Store embedding provider id and model id with embeddings.
- Do not recompute embeddings when chunk content hash and embedding model are unchanged.
- Persist failures with normalized provider error codes.

## Index Writer

Index writer must write to:

- PostgreSQL/pgvector for vector retrieval.
- Meilisearch for keyword retrieval.

Meilisearch documents must include filterable fields:

- `tenantId`
- `knowledgeBaseId`
- `documentId`
- `chunkId`

Search indexing must never index chunks outside the authorized tenant/knowledge base scope.

## RAG Query Pipeline

Query pipeline:

1. Resolve actor and tenant.
2. Validate selected knowledge bases.
3. Apply knowledge-base authorization.
4. Prepare query and conversation context.
5. Optionally rewrite or complete query.
6. Run pgvector retrieval with tenant and knowledge-base filters.
7. Run Meilisearch keyword retrieval with tenant and knowledge-base filters.
8. Fuse results.
9. Rerank with Tongyi/Bailian.
10. Assemble citations.
11. Generate answer with DeepSeek.
12. Persist chat message, retrieval run, retrieval results, citations, and feedback hooks.

Authorization filters must be applied before vector/keyword results are returned to application code.

## Hybrid Search Fusion

Fusion must preserve source metadata needed for citations.

Recommended result shape:

```typescript
type RetrievalCandidate = {
  chunkId: string;
  documentId: string;
  knowledgeBaseId: string;
  vectorScore?: number;
  keywordScore?: number;
  fusedScore: number;
  content: string;
  sourceLocator?: string;
  metadata: Record<string, unknown>;
};
```

Fusion should deduplicate by `chunkId`.

## Rerank

Rerank input must be limited to a bounded candidate count.

Rerank output must preserve:

- original candidate identity
- rerank score
- rank order
- provider/model metadata

If rerank provider is unavailable, the system may fall back to fused scores and must log `provider.rerank_unavailable`.

## Citations

Every final answer must include citations when knowledge context was used.

Citation fields:

- `messageId`
- `documentId`
- `chunkId`
- `sourceTitle`
- `sourceUri`
- `sourceLocator`
- `snippet`
- `rank`

Snippets should be short and must not expose unauthorized content.

## Feedback

Feedback records include:

- useful/not useful.
- optional text reason.
- chat message id.
- retrieval run id.
- citation ids.
- actor id.
- tenant id.

Feedback must not modify the original answer or retrieval run.

