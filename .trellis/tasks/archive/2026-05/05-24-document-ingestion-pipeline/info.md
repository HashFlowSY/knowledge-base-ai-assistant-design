# Current Progress And Flow Notes

## Existing Upload Save Path

* `src/apps/api/src/modules/documents/procedures/upload-document-file.ts` authenticates before parsing the body, validates multipart upload constraints, computes a SHA-256 checksum, and delegates to `documentService.uploadDocumentFile`.
* `src/packages/knowledge/src/operations/upload-document-file.ts` authorizes the knowledge base, detects active duplicate checksums, reserves `documents`/`document_sources`/`ingestion_jobs`, writes the source object, and finalizes the source as `available` plus job as `queued`.
* `src/packages/storage/src/index.ts` owns S3-compatible put/delete and object key generation.

## Existing Data Structures

* `src/packages/db/src/schema/ingestion.ts` defines persisted job statuses `pending_source`, `queued`, `running`, `retrying`, `completed`, `failed`, `cancelled` and step names `source_connector`, `parser`, `normalizer`, `chunker`, `embedding`, `index_writer`.
* `src/packages/db/src/schema/knowledge.ts` defines `document_chunks` and `chunk_embeddings` with tenant, knowledge-base, document, version, content hash, provider/model, and `vector(1024)` fields.
* `src/packages/queue/src/schemas.ts` defines file/url ingestion payload schemas but no producer or BullMQ client helper yet.

## Current Gaps

* No BullMQ producer is called after upload finalization.
* No BullMQ producer/worker runtime configuration exists yet beyond `REDIS_URL`, `WORKER_CONCURRENCY`, queue names, and payload schemas.
* No worker processor exists for `ingestion` queue jobs.
* `@kb/ingestion` only contains step/status schemas and has no source loader, parser, normalizer, chunker, embedding, or index writer implementation.
* `@kb/ai-providers` can configure and connection-test embedding providers, but does not expose an embedding generation client.
* `@kb/search` only has scope/backend schemas and no Meilisearch indexing helper.
* `@kb/rag` only has retrieval/citation schemas; retrieval is not part of this task.
* OCR is not part of this task; scanned/image-only PDFs should fail parsing when no text layer can be extracted.

## MQ Configuration Contract

* Existing config already present:
  * `REDIS_URL` is required and should be reused by both API producer and worker consumer.
  * `WORKER_CONCURRENCY` exists with default `2` and should map to BullMQ worker concurrency.
  * Queue names are already constrained to `ingestion` and `maintenance`.
  * Ingestion payload schemas and `createIngestionJobId` already exist in `@kb/queue`.
* New config required for this task:
  * `INGESTION_QUEUE_ATTEMPTS`, default `3`.
  * `INGESTION_QUEUE_BACKOFF_MS`, default `5000`.
  * `INGESTION_REQUEUE_STALE_AFTER_MS`, default `300000`.
  * `INGESTION_REQUEUE_BATCH_SIZE`, default `100`.
  * `INGESTION_PARSER_CONCURRENCY`, default `2`.
  * `INGESTION_EMBEDDING_CONCURRENCY`, default `1`.
  * `INGESTION_INDEX_CONCURRENCY`, default `1`.
  * `INGESTION_CHUNK_SIZE`, default `1000`.
  * `INGESTION_CHUNK_OVERLAP`, default `150`.
* BullMQ defaults:
  * Queue name: `ingestion`.
  * Job id: `ingestion__{encodeURIComponent(tenantId)}__{encodeURIComponent(documentId)}__{encodeURIComponent(documentVersion)}`.
  * BullMQ custom job ids must not contain `:` in this project because BullMQ 5.x rejects many colon-containing custom ids.
  * Attempts: `INGESTION_QUEUE_ATTEMPTS`.
  * Backoff: exponential, base delay `INGESTION_QUEUE_BACKOFF_MS`, with jitter/custom strategy where available.
  * Retention: `removeOnComplete: { count: 1000 }`, `removeOnFail: { count: 5000 }`.
* Recovery contract:
  * PostgreSQL `ingestion_jobs` is durable state; BullMQ is transport.
  * Enqueue failures after DB finalization remain recoverable with `QUEUE_ENQUEUE_FAILED`.
  * Startup and periodic worker-side scanning requeue stale `queued`/`retrying` and retryable failed jobs.
  * Requeue reconstructs payload from persisted DB/source rows.
  * No manual retry API/UI and no new maintenance queue are part of this MVP.

## Transaction And Consistency Contract

* No single long-running ingestion transaction:
  * DB transactions are only for reservation/finalization, worker claim, step log/status updates, result persistence batches, and final ready/failed transitions.
  * Object storage, Redis/BullMQ, parser work, embedding provider calls, and search index writes are outside DB transactions.
* Upload/save boundary:
  * Reserve DB rows transactionally.
  * Upload source object outside DB transaction.
  * Finalize `document_sources.available` and `ingestion_jobs.queued` transactionally after object storage succeeds.
  * Enqueue BullMQ after DB commit; on enqueue failure, keep the DB job recoverable and store `QUEUE_ENQUEUE_FAILED`.
* Worker boundary:
  * Claim jobs with an atomic conditional update from `queued`/`retrying` to `running`.
  * Duplicate BullMQ deliveries must collapse at the DB claim layer.
  * Step logs and status changes should be short transactions; slow external work must happen after the transaction commits.
* Result persistence:
  * Write `document_chunks` and `chunk_embeddings` in transaction-scoped batches.
  * Retry must replace/upsert the same document-version output and must not duplicate chunks or embeddings.
  * Stable keys must include tenant, knowledge base, document, document version, chunk identity/content hash, provider, and model where relevant.
* Search/index boundary:
  * Search index writes are outside DB transactions and must use stable document ids for overwrite-on-retry behavior.
  * Mark job `completed` and document `ready` only after DB persistence and required indexing succeed.
* Version safety:
  * Status updates must guard on document version so an older job cannot overwrite a newer version's status.
  * Requeue payloads are rebuilt from persisted source/job rows.

## Cross-Layer Flow To Preserve

```text
web upload form
  -> API upload validation
  -> knowledge service reservation/finalization
  -> object storage source object
  -> persisted ingestion job
  -> BullMQ ingestion queue with stable job id
  -> worker processor
  -> @kb/ingestion source loader/parser/normalizer/chunker
  -> @kb/ai-providers embedding client
  -> document_chunks/chunk_embeddings
  -> @kb/search keyword index
  -> document/job status + ingestion_job_logs
```

## Contract Owners

* API request/response and upload safety: `src/apps/api`.
* Knowledge-base authorization, document/source/job reservation: `src/packages/knowledge`.
* Object storage access/key format: `src/packages/storage`.
* Queue payload, job ids, producer helpers: `src/packages/queue`.
* Worker lifecycle/processors: `src/apps/worker`.
* Ingestion pipeline orchestration and step contracts: `src/packages/ingestion`.
* Embedding provider interface and vendor mapping: `src/packages/ai-providers`.
* Keyword/vector search helpers: `src/packages/search`.
* Schema/migrations: `src/packages/db`.

## Decisions Needed Before Implementation

* MVP parser formats are confirmed: PDF, Markdown, and TXT only.
* Parser dependency research is in `research/parser-dependencies.md`; accepted MVP is `pdf-parse` for PDF and built-in `TextDecoder` for Markdown/TXT.
* `pdf-parse@2.x` must be called through `PDFParse`: `new PDFParse({ data }).getText()` followed by `destroy()`. The legacy v1 default function shape is not available in the installed package.
* Chunking defaults are confirmed: character-based `chunkSize = 1000`, `chunkOverlap = 150`, runtime-configurable; Markdown prefers heading/paragraph/list boundaries, PDF/TXT prefer paragraph/sentence boundaries.
* Meilisearch indexing must set `primaryKey=id`, generate ids with only letters/numbers/hyphens/underscores, configure filterable attributes (`tenantId`, `knowledgeBaseId`, `documentId`, `chunkId`), and wait for async task success before a job/document is marked completed/ready.
* BullMQ enqueue/recovery strategy is confirmed: PostgreSQL job state is source of truth, BullMQ uses stable job id `ingestion__{encodeURIComponent(tenantId)}__{encodeURIComponent(documentId)}__{encodeURIComponent(documentVersion)}`, enqueue failures are stored as recoverable queue errors and requeued by worker startup or maintenance scanning.
* Missing/disabled embedding provider behavior is confirmed: fail at embedding with `EMBEDDING_PROVIDER_NOT_CONFIGURED`, keep retryable state, and do not mark the document ready/searchable.
* Retry scope is confirmed: system recovery/requeue only; no manual retry API or frontend retry control in this task.
* Transaction strategy is confirmed: no full-pipeline DB transaction; use short DB transactions, stable ids, idempotent writes, queue recovery, and document-version guards.
* MQ configuration is confirmed for this task:
  * existing `REDIS_URL` for API producer and worker consumer;
  * existing `WORKER_CONCURRENCY`, default `2`;
  * new `INGESTION_QUEUE_ATTEMPTS`, default `3`;
  * new `INGESTION_QUEUE_BACKOFF_MS`, default `5000`;
  * new `INGESTION_REQUEUE_STALE_AFTER_MS`, default `300000`;
  * new `INGESTION_REQUEUE_BATCH_SIZE`, default `100`;
  * new `INGESTION_PARSER_CONCURRENCY`, default `2`;
  * new `INGESTION_EMBEDDING_CONCURRENCY`, default `1`;
  * new `INGESTION_INDEX_CONCURRENCY`, default `1`;
  * BullMQ retention defaults `removeOnComplete: { count: 1000 }`, `removeOnFail: { count: 5000 }`.
* Define embedding client interface in `@kb/ai-providers` before ingestion calls providers.
