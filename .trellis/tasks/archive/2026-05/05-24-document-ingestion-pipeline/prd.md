# Uploaded Document Ingestion Pipeline

## Goal

Complete the post-upload ingestion path for uploaded documents: read the saved source object, parse supported document formats, normalize text, split/chunk deterministically, generate embeddings through the configured embedding provider, persist chunks and vectors, write keyword/vector search indexes, and update ingestion job state so the UI can show processing progress and failures.

This task starts from the existing backend upload-save path. It must not duplicate the upload validation/storage work that already exists.

## What I Already Know

* A Trellis task exists at `.trellis/tasks/05-24-document-ingestion-pipeline/` with status `in_progress`.
* User confirmed MVP parsing formats are PDF, Markdown, and TXT only.
* User accepted the recommended parser approach: `pdf-parse` for text-layer PDF extraction and built-in `TextDecoder` for Markdown/TXT.
* Implementation note: `pdf-parse@2.x` exports `PDFParse`; use `new PDFParse({ data }).getText()` and `destroy()`, not the legacy v1 default function.
* User accepted the recommended MVP chunking defaults: character-based `chunkSize = 1000`, `chunkOverlap = 150`, runtime-configurable, with boundary-aware splitting.
* User accepted the queue handoff strategy: PostgreSQL job state is the source of truth; BullMQ uses stable job ids; enqueue failures are recoverable through persisted job state and requeue scanning.
* User accepted missing/disabled embedding provider behavior: parsing/chunking may complete internally, but ingestion fails fast at embedding with `EMBEDDING_PROVIDER_NOT_CONFIGURED` and does not publish a ready/searchable document.
* User accepted retry scope for this task: implement system recovery/requeue, but do not build a manual retry API or frontend retry control.
* OCR is intentionally excluded from this task; scanned/image-only PDFs that do not yield text should fail with a clear parse error.
* The previous upload-save task implemented `POST /api/knowledge-bases/:knowledgeBaseId/documents/upload`, object storage upload, metadata reservation/finalization, duplicate checksum handling, and ingestion job row creation.
* API upload validation authenticates the actor, rate-limits/concurrency-limits the request, checks `Content-Length`, parses exactly one multipart file, validates file type/size/signature, computes checksum, and calls `documentService.uploadDocumentFile`.
* The knowledge upload service reserves `documents`, `document_sources`, and `ingestion_jobs`, uploads the source object, then finalizes the source as `available` and the job as `queued`.
* Database schema already has `document_chunks`, `chunk_embeddings` with `vector(1024)`, `ingestion_jobs`, and `ingestion_job_logs`.
* The `@kb/ingestion`, `@kb/rag`, and `@kb/search` packages currently expose mostly schemas/contracts, not working ingestion or retrieval implementations.
* The worker app currently only starts/stops with lifecycle logs; it does not create BullMQ workers or process queued ingestion jobs.
* The `@kb/queue` package defines an ingestion queue name and a file/url job payload schema, but the upload service does not enqueue BullMQ work yet.
* Current MQ-related config is incomplete: `REDIS_URL`, `WORKER_CONCURRENCY`, queue names, and payload schemas exist; BullMQ producer/worker options, retry/backoff, retention, and requeue scanning still need to be implemented in this task.
* The `@kb/ai-providers` package can store and connection-test provider config for `embedding`, but it does not yet expose an embedding generation client/interface for ingestion.

## Current Module Progress

* Implemented upload entry: `src/apps/api/src/modules/documents/procedures/upload-document-file.ts`.
* Implemented upload persistence/storage state machine: `src/packages/knowledge/src/operations/upload-document-file.ts`.
* Implemented storage key/S3-compatible put/delete boundary: `src/packages/storage/src/index.ts`.
* Implemented DB tables and indexes needed by ingestion output: `src/packages/db/src/schema/knowledge.ts` and `src/packages/db/src/schema/ingestion.ts`.
* Placeholder ingestion contract only: `src/packages/ingestion/src/index.ts`.
* Placeholder worker lifecycle only: `src/apps/worker/src/lifecycle.ts`.
* Placeholder search and RAG contracts only: `src/packages/search/src/index.ts`, `src/packages/rag/src/index.ts`.

## Assumptions

* MVP file ingestion should process only PDF, Markdown, and TXT. HTML remains for URL ingestion, not arbitrary HTML file upload.
* PDF support means text-layer PDF extraction only. Scanned/image-only PDFs require OCR and are out of scope.
* API upload should stay asynchronous: upload returns `documentId` and `jobId`; worker performs parsing, chunking, embedding, and indexing.
* The first implementation should preserve the existing `vector(1024)` embedding dimension and use the configured tenant `embedding` provider.
* The worker must use persisted `ingestion_jobs` state as source of truth, not Redis-only state.
* Chunking defaults should favor stable, testable behavior over token-perfect splitting. Token-based splitting can replace the internal splitter later behind the same contract.
* Queue consistency should use existing persisted statuses where possible. `retrying` with `lastErrorCode = "QUEUE_ENQUEUE_FAILED"` is acceptable for enqueue failures unless implementation reveals a stronger need for a new enum.
* Missing or disabled embedding provider is a configuration failure, not a parser failure. It should not create a partially searchable document.
* Manual retry UX/API is out of scope for this task; implementation should expose enough persisted state for a later retry feature.
* Ingestion must not run as one long database transaction. External systems such as object storage, Redis/BullMQ, embedding providers, and Meilisearch/search indexes require short DB transactions plus idempotent recovery.

## Open Questions

* None currently.

## Requirements

* Add an ingestion orchestration boundary in `@kb/ingestion` with typed step inputs/results for source, parser, normalizer, chunker, embedding, and index writer.
* Add file source loading from object storage using the `document_sources` row created during upload.
* Add parser implementations for PDF, Markdown, and TXT: `pdf-parse` for PDF text-layer extraction, built-in `TextDecoder` for Markdown/TXT, with unsupported/suspicious content rejected before expensive work.
* Treat empty/near-empty PDF extraction as a normalized parse failure for this task rather than falling back to OCR.
* Add deterministic normalization and chunking with runtime-configurable defaults: `INGESTION_CHUNK_SIZE = 1000` characters and `INGESTION_CHUNK_OVERLAP = 150` characters.
* Markdown chunking should prefer heading, paragraph, and list boundaries; PDF/TXT chunking should prefer paragraph and sentence boundaries; all formats may fall back to hard character limits when needed.
* Add embedding generation through `@kb/ai-providers`, including batch requests, provider/model metadata, normalized provider errors, and provider concurrency control.
* If the tenant has no enabled embedding provider, fail the ingestion job/document with `EMBEDDING_PROVIDER_NOT_CONFIGURED`; keep enough persisted state to retry after configuration is fixed, but do not mark the document `ready`.
* Persist chunks into `document_chunks` and embeddings into `chunk_embeddings` idempotently by document version/content hash/model.
* Add keyword index writing through `@kb/search` and vector persistence through PostgreSQL/pgvector.
* Use explicit transaction boundaries for reservation/finalization, worker claim, result persistence, and final status transitions; do not keep DB transactions open while parsing files, calling embedding providers, enqueueing BullMQ jobs, or writing external search indexes.
* Add BullMQ producer/recovery strategy so finalized upload jobs become durable worker work, including handling enqueue failures without losing the persisted job.
* Enqueue file-ingestion jobs with stable BullMQ-safe job id `ingestion__{encodeURIComponent(tenantId)}__{encodeURIComponent(documentId)}__{encodeURIComponent(documentVersion)}` and payload values derived from persisted DB/source metadata, not from user input.
* If BullMQ enqueue fails after DB finalization, keep the persisted ingestion job recoverable, set a normalized queue error such as `QUEUE_ENQUEUE_FAILED`, and let worker startup or a maintenance/reconciler path requeue stale `queued`/`retrying` jobs.
* Implement system recovery requeue for `queued`, `retrying`, and specific retryable failed jobs, but do not add a user-facing manual retry endpoint or UI in this task.
* Implement explicit BullMQ runtime configuration:
  * `REDIS_URL` remains the Redis connection source for API producer and worker consumer.
  * `WORKER_CONCURRENCY` remains the BullMQ worker concurrency default, currently `2`.
  * `INGESTION_QUEUE_ATTEMPTS` default `3`.
  * `INGESTION_QUEUE_BACKOFF_MS` default `5000`, used as exponential backoff base delay with jitter/custom strategy where supported.
  * `INGESTION_REQUEUE_STALE_AFTER_MS` default `300000`, used by worker recovery scanning for stale queued/retryable jobs.
  * `INGESTION_REQUEUE_BATCH_SIZE` default `100`.
  * `INGESTION_PARSER_CONCURRENCY` default `2`.
  * `INGESTION_EMBEDDING_CONCURRENCY` default `1`.
  * `INGESTION_INDEX_CONCURRENCY` default `1`.
* Use BullMQ job retention defaults `removeOnComplete: { count: 1000 }` and `removeOnFail: { count: 5000 }`; PostgreSQL remains the durable status source.
* Implement recovery as worker startup plus periodic worker-side scanning, not a user-facing API and not a new queue for this task.
* Add worker processor in `src/apps/worker` that processes `queued` ingestion jobs and updates `ingestion_jobs` plus `ingestion_job_logs` before/after each step.
* Update document status from `pending` to `processing`, then `ready` or `failed`.
* Preserve tenant, knowledge-base, document, document version/source hash, request, and job correlation ids across logs and persisted state.
* Avoid logging raw document content, chunk content, provider keys, full provider responses, or object storage credentials.

## MQ Configuration Contract

* Current repo state:
  * `@kb/config` already defines `REDIS_URL`; this is the Redis connection source for BullMQ producers and workers.
  * `@kb/config` already defines `WORKER_CONCURRENCY` with default `2`; this becomes the BullMQ `Worker` concurrency.
  * `@kb/queue` already defines queue names `ingestion` and `maintenance`, ingestion payload schemas, and stable ingestion job id helper.
  * `src/apps/worker` does not yet create BullMQ `Worker`/`QueueEvents`; it only has lifecycle logging.
* Runtime config to add in this task:
  * `INGESTION_QUEUE_ATTEMPTS=3`.
  * `INGESTION_QUEUE_BACKOFF_MS=5000`.
  * `INGESTION_REQUEUE_STALE_AFTER_MS=300000`.
  * `INGESTION_REQUEUE_BATCH_SIZE=100`.
  * `INGESTION_PARSER_CONCURRENCY=2`.
  * `INGESTION_EMBEDDING_CONCURRENCY=1`.
  * `INGESTION_INDEX_CONCURRENCY=1`.
  * `INGESTION_CHUNK_SIZE=1000`.
  * `INGESTION_CHUNK_OVERLAP=150`.
* BullMQ job options:
  * Queue name is `ingestion`.
  * Job id is `ingestion__{encodeURIComponent(tenantId)}__{encodeURIComponent(documentId)}__{encodeURIComponent(documentVersion)}`.
  * Job id must not contain `:` because BullMQ 5.x rejects many custom ids containing colons.
  * Attempts come from `INGESTION_QUEUE_ATTEMPTS`.
  * Backoff is exponential with base delay from `INGESTION_QUEUE_BACKOFF_MS`; add jitter/custom strategy if the selected BullMQ version does not expose native jitter.
  * Retention is `removeOnComplete: { count: 1000 }` and `removeOnFail: { count: 5000 }`.
* Ownership:
  * `@kb/queue` owns BullMQ producer/client helpers, queue names, payload validation, stable job ids, and shared default job options.
  * `src/apps/api`/`@kb/knowledge` calls the `@kb/queue` producer after the DB source/job has been finalized.
  * `src/apps/worker` owns BullMQ `Worker`, `QueueEvents`, startup recovery, periodic requeue scanning, processors, and graceful shutdown.
* Recovery:
  * PostgreSQL `ingestion_jobs` remains the source of truth; Redis/BullMQ is the execution transport only.
  * If enqueue fails after DB finalization, persist a recoverable queue error such as `QUEUE_ENQUEUE_FAILED`.
  * Worker startup plus periodic worker-side scanning requeues stale `queued`/`retrying` jobs and retryable failed jobs from DB state.
  * Recovery reconstructs payload from persisted DB/source metadata, not from user input.
  * No user-facing manual retry API, frontend retry button, or separate `maintenance` queue is required for this MVP.

## Transaction And Consistency Contract

* Do not wrap the full ingestion pipeline in one DB transaction.
  * Parsing, embedding provider calls, Redis/BullMQ enqueue, object storage reads/writes, and external search index writes must run outside DB transactions.
  * DB transactions should be short and scoped to a single durable state transition or result write batch.
* Upload/save stage:
  * Reserve `documents`, `document_sources`, and `ingestion_jobs` in a DB transaction.
  * Object storage upload remains outside the DB transaction.
  * Finalize `document_sources` as `available` and `ingestion_jobs` as `queued` in a DB transaction after object storage succeeds.
  * Enqueue BullMQ only after DB finalization commits. If enqueue fails, do not roll back the saved document; persist a recoverable queue error and let recovery requeue from DB state.
* Worker claim:
  * Claim jobs atomically with a conditional DB update, for example `queued`/`retrying` -> `running`.
  * If two workers receive the same stable BullMQ job id, only one worker may successfully claim the DB job.
  * Every worker-side status transition must preserve tenant, document, document version, and ingestion job identity.
* Step execution:
  * Write `ingestion_job_logs` in short transactions around step start/success/failure.
  * Do not hold a transaction open while reading/parsing the source object, generating embeddings, or indexing search documents.
  * Failures must be persisted with normalized error code/message and enough metadata for automatic retry where allowed.
* Chunk and embedding persistence:
  * Persist `document_chunks` and `chunk_embeddings` in transaction-scoped batches.
  * Retry must be idempotent: either replace the same document-version output set or upsert by stable keys derived from tenant, knowledge base, document, document version, chunk index/content hash, provider, and model.
  * Partial writes from a failed attempt must not produce duplicate chunks or embeddings on retry.
* Search index consistency:
  * External keyword/vector index writes are outside the DB transaction.
  * Index document ids must be stable so retry overwrites the same indexed documents rather than duplicating them.
  * Mark the ingestion job `completed` and document `ready` only after DB chunks/embeddings and required search indexing have succeeded.
* Version safety:
  * Document status updates must include a document-version guard so an older ingestion job cannot mark a newer document version as `ready` or `failed`.
  * Retry/recovery payloads must be reconstructed from persisted DB/source rows, not from stale user request data.

## Acceptance Criteria

* [ ] Uploading a supported file creates a durable ingestion job and the worker can process it end-to-end.
* [ ] Successful ingestion produces deterministic `document_chunks` and `chunk_embeddings` rows for the uploaded document version.
* [ ] Successful ingestion marks the document `ready`, the ingestion job `completed`, and records step-level logs.
* [ ] Unsupported or parse-failing documents mark the document/job `failed` with normalized error code/message and do not create partial duplicate chunks/embeddings on retry.
* [ ] Retrying the same job is idempotent: no duplicate chunks, embeddings, search documents, or success audit/log records.
* [ ] Embedding provider failures are normalized, bounded by retry/concurrency rules, and visible in `ingestion_jobs`/logs.
* [ ] Missing or disabled embedding provider fails with `EMBEDDING_PROVIDER_NOT_CONFIGURED` and does not leave a ready/searchable partial document.
* [ ] Keyword/vector indexing uses tenant and knowledge-base scoped identifiers needed by later retrieval authorization.
* [ ] Unit and integration tests cover the parser/chunker/embedding/index writer boundaries, worker success/failure/retry behavior, and upload-to-worker handoff.
* [ ] Queue handoff tests cover stable job ids, duplicate enqueue collapse, enqueue failure persistence, and requeue recovery without duplicate ingestion output.
* [ ] MQ config tests cover validated defaults, env overrides, BullMQ job options, worker concurrency, and graceful Redis/BullMQ shutdown.
* [ ] Recovery tests cover worker/maintenance requeue of eligible jobs; manual retry API/UI is not required.
* [ ] Transaction tests cover enqueue-after-commit failure recovery, atomic worker claim under duplicate jobs, idempotent chunk/embedding persistence after retry, and version-guarded document status updates.

## Verification Notes

* 2026-05-24: Implementation has been added for the PDF/Markdown/TXT uploaded-document ingestion MVP.
* 2026-05-24 chain verification found and fixed four integration issues: BullMQ-safe job ids must avoid `:`, `pdf-parse@2.x` must use the `PDFParse` class API, Meilisearch writes must specify `primaryKey=id` plus wait for async task success before marking ingestion ready, and Meilisearch document ids must use only letters, numbers, hyphens, and underscores.
* 2026-05-24 local end-to-end verification passed with API + worker + PostgreSQL/pgvector + Redis/BullMQ + MinIO + Meilisearch + local mock OpenAI-compatible embedding provider. Final verified knowledge base: `f82ff303-3150-495f-b4e3-8b1bd431bd70`; PDF/Markdown/TXT documents are `ready`, jobs are `completed`, chunks/embeddings are `456/456`, `1/1`, and `1/1`, and Meilisearch filter `knowledgeBaseId = f82ff303-3150-495f-b4e3-8b1bd431bd70` returns `estimatedTotalHits = 458`.
* Automated local checks passed with Turbo cache bypassed: `pnpm exec turbo test --force`, `pnpm exec turbo typecheck --force`, `pnpm exec turbo lint --force`, and `pnpm exec turbo build --force`.
* A targeted post-build check also passed after removing the Next generated-file side effect: `pnpm --filter @kb/web typecheck`.
* Acceptance checkboxes remain unchecked unless the exact criterion is fully covered; this local verification used a mock OpenAI-compatible embedding provider instead of a paid external provider.

## Definition Of Done

* Tests added or updated for ingestion package, queue handoff, worker processor, provider embedding client, search indexing, and DB idempotency.
* `pnpm lint`, `pnpm typecheck`, `pnpm build`, and relevant package tests pass.
* Any new runtime config is validated in `@kb/config` and documented in env examples.
* Docs/spec updates are made if implementation adds durable conventions not already covered by `.trellis/spec`.
* The task is started only after the confirmed MVP scope is recorded in this document.

## Out Of Scope

* URL ingestion/fetching and HTML parsing, unless needed only to keep shared interfaces future-proof.
* DOCX/XLSX/CSV/PPTX/OCR, including scanned/image-only PDF OCR fallback.
* Chat/RAG answer generation and citation UI.
* User-facing manual retry API or frontend retry control.
* Document deletion/re-index cleanup workflows beyond idempotent overwrite for this ingestion path.

## Technical Notes

* Current upload flow: web/API upload form -> API validation -> knowledge service -> storage object write -> `documents`/`document_sources`/`ingestion_jobs`.
* Needed flow: queued ingestion job -> worker -> `@kb/ingestion` source loader -> parser -> normalizer -> chunker -> `@kb/ai-providers` embedding -> `document_chunks`/`chunk_embeddings` -> `@kb/search` keyword index -> job/document status.
* MQ implementation needs new BullMQ wiring in `@kb/queue` and `src/apps/worker`; current `@kb/queue` is schema-only and `src/apps/worker` is lifecycle-only.
* Relevant specs: `.trellis/spec/backend/rag-ingestion.md`, `.trellis/spec/backend/worker-queue.md`, `.trellis/spec/backend/ai-provider.md`, `.trellis/spec/backend/storage.md`, `.trellis/spec/backend/database.md`, `.trellis/spec/backend/package-boundaries.md`, `.trellis/spec/testing/strategy.md`, `.trellis/spec/guides/cross-layer-thinking-guide.md`, `.trellis/spec/guides/code-reuse-thinking-guide.md`.
* Parser dependency research: `research/parser-dependencies.md`; recommendation accepted for MVP.
* Provider, queue, and indexing implementation details still require design convergence before implementation.
