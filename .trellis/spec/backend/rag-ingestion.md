# RAG and Ingestion Guidelines

These rules define the core knowledge ingestion and retrieval pipeline.

## Package Ownership

- `src/packages/ingestion` owns ingestion pipeline orchestration.
- `src/packages/rag` owns query-time retrieval, fusion, rerank, citation assembly, and feedback recording.
- `src/packages/ai-providers` owns provider calls for embedding, rerank, and chat.
- `src/packages/search` owns Meilisearch indexing/search helpers.
- `src/packages/storage` owns file/object access.
- `src/packages/knowledge` owns knowledge base, document, source, and permission domain rules.

## Scenario: Ingestion Package Module Layout

### 1. Scope / Trigger

- Trigger: adding or refactoring ingestion package implementation files under `src/packages/ingestion/src`.
- Scope: parser, chunker, pipeline orchestration, repository adapters, recovery logic, and public package exports.

### 2. Signatures

- Public consumers import only from `@kb/ingestion`.
- `src/packages/ingestion/src/index.ts` is the public barrel and must re-export public contracts/functions.

### 3. Contracts

- Implementation files must live in functional directories:
  - `contracts/`
  - `parsing/`
  - `chunking/`
  - `pipeline/`
  - `repositories/`
  - `recovery/`
  - `tests/`
- Do not place new implementation or test files directly under `src/packages/ingestion/src/` except `index.ts`.
- Worker and API code must not import package internals such as `@kb/ingestion/pipeline/...`.

### 4. Validation & Error Matrix

| Condition | Required outcome |
| --- | --- |
| New ingestion implementation file is added | File is placed in the matching functional directory |
| Public API is needed by worker/API | Export from `index.ts`; consumer imports from `@kb/ingestion` |
| Helper is only used inside one functional area | Keep helper internal to that directory |
| Root `src/` receives a non-`index.ts` implementation/test file | Structure test failure |

### 5. Good/Base/Bad Cases

- Good: `src/packages/ingestion/src/parsing/parser.ts`.
- Base: `src/packages/ingestion/src/contracts/types.ts`.
- Bad: `src/packages/ingestion/src/parser.ts`.

### 6. Tests Required

- Unit tests for parser/chunker/pipeline behavior stay grouped under `src/packages/ingestion/src/tests/`.
- A structure test must assert the allowed directories and that `index.ts` stays a small barrel.

### 7. Wrong vs Correct

Wrong:

```typescript
import { createIngestionPipeline } from "@kb/ingestion/pipeline/pipeline";
```

Correct:

```typescript
import { createIngestionPipeline } from "@kb/ingestion";
```

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

### PDF Parser Contract

Use `pdf-parse` for MVP text-layer PDF extraction. The installed v2 API exports
`PDFParse`, not the legacy default function, so production code must support:

```typescript
const parser = new PDFParse({ data: pdfBytes });
try {
  const result = await parser.getText();
  // result.text is the extracted text; result.total is the page count.
} finally {
  await parser.destroy();
}
```

Wrong:

```typescript
const pdfParse = (await import("pdf-parse")).default;
await pdfParse(pdfBytes);
```

Required tests:

- A real text-layer PDF fixture is parsed by the bundled parser.
- Empty or image-only extraction fails with `PARSE_EMPTY_TEXT`.
- OCR is not invoked in the PDF parser path.

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

Meilisearch writes are asynchronous. The index writer must:

- Configure filterable attributes before documents are considered searchable:
  `tenantId`, `knowledgeBaseId`, `documentId`, and `chunkId`.
- Write documents with `primaryKey=id`; do not rely on Meilisearch primary-key
  inference because chunk documents contain multiple `*Id` fields.
- Generate document `id` values with only Meilisearch-safe characters:
  letters, numbers, hyphens, and underscores. Do not use `:` in search
  document ids.
- Poll the returned Meilisearch task until it reaches `succeeded`.
- Throw on `failed`, `canceled`, missing task ids, or task timeout so ingestion
  does not mark a document `ready` while keyword indexing actually failed.

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

## Scenario: Non-Streaming RAG Chat Query

### 1. Scope / Trigger

- Trigger: browser chat submits a question to one selected knowledge base and expects one complete response.
- Owner: `src/packages/rag` owns retrieval orchestration, run/result persistence, citations, and feedback hooks; `src/apps/api` owns HTTP validation, auth context, and error envelopes.

### 2. Signatures

- `GET /api/chat/sessions?knowledgeBaseId=<id>` -> `ApiSuccessResponse<ChatSessionsResponse>`
- `POST /api/chat/sessions` with `{ knowledgeBaseId }` -> `ApiSuccessResponse<CreateChatSessionResponse>`
- `GET /api/chat/sessions/:sessionId/messages` -> `ApiSuccessResponse<ChatMessagesResponse>`
- `POST /api/chat/messages` with `{ knowledgeBaseId, question, sessionId: string | null }` -> `ApiSuccessResponse<ChatSubmitResponse>`
- `POST /api/chat/messages/:messageId/feedback` with `{ rating, reason, citationIds }` -> `ApiSuccessResponse<SubmitAnswerFeedbackResponse>`
- Repository boundary must expose authorization, session/message access checks, retrieval run start/complete, retrieval result recording, message/citation persistence, feedback persistence, vector search, and recent history reads.

### 3. Contracts

- Chat v1 accepts exactly one `knowledgeBaseId`; persist it through `chat_sessions.selected_knowledge_base_ids` as a one-item array.
- Submit-question is non-streaming: API returns user message, assistant message, citations, grounding label, and session summary only after retrieval, rerank, context assembly, generation, and persistence finish.
- Retrieval defaults are vector top 30, keyword top 30, fused top 50, reranked/context top 8, recent history 6 messages, and context budget 6,000 estimated tokens.
- Every retrieval must create `retrieval_runs`, record final ranked `retrieval_results`, store `retrievalRunId` on assistant message metadata, and attach it to answer citations and feedback.
- Rerank fallback must log `provider.rerank_unavailable` with safe metadata only; do not log prompts, chunk content, provider keys, or full model output.
- Session/message reads and feedback writes must be scoped to tenant and actor-owned accessible sessions.

### 4. Validation & Error Matrix

| Condition | Required outcome |
| --- | --- |
| Missing session | `UNAUTHORIZED` envelope |
| Empty or overlong question | `VALIDATION_ERROR` envelope |
| Member uses unassigned knowledge base | `FORBIDDEN` envelope before retrieval/provider calls |
| Session/message is absent or inaccessible | `NOT_FOUND` envelope |
| Rerank provider unavailable | Fall back to fused ranking, cap grounding at `依据有限`, log safe fallback event |
| No usable context | Persist assistant no-answer message with `未找到依据` |
| Chat provider unavailable | Persist safe assistant failure text; do not expose raw provider body |

### 5. Good/Base/Bad Cases

- Good: API validates input, resolves actor/tenant, RAG checks knowledge-base authorization, then both pgvector and Meilisearch receive tenant and knowledge-base filters.
- Base: existing sessions can be continued only after repository `getSession` confirms tenant, actor ownership, and selected knowledge-base scope.
- Bad: accepting `sessionId` plus any caller-supplied `knowledgeBaseId` and appending messages without loading the persisted session scope.

### 6. Tests Required

- Unit tests for RRF fusion/deduplication, context assembly limits, no-answer handling, rerank fallback logging, retrieval run/result persistence orchestration, inaccessible sessions, inaccessible feedback messages, and unauthorized knowledge bases.
- API tests for chat validation, authenticated submit/list/feedback routes, service error mapping, and typed Hono RPC route exposure.
- Web tests for real chat hooks, query invalidation, no production mock-store imports, and visible forbidden/error/no-answer states.

### 7. Wrong vs Correct

#### Wrong

```typescript
await repository.appendMessage({
  sessionId: body.sessionId,
  knowledgeBaseId: body.knowledgeBaseId,
  role: "user",
});
```

This trusts caller-supplied scope and can write into another accessible tenant session.

#### Correct

```typescript
const session = await repository.getSession({
  actor,
  knowledgeBaseId: body.knowledgeBaseId,
  sessionId: body.sessionId,
});

if (session === null) {
  return chatResourceNotFound();
}
```

Load the persisted session through the repository boundary before writing or reading chat content.

Feedback must not modify the original answer or retrieval run.
