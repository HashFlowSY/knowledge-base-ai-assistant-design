# Document Ingestion Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Process uploaded PDF, Markdown, and TXT source files asynchronously from persisted upload metadata through parsing, chunking, embedding, database persistence, and search indexing.

**Architecture:** PostgreSQL `ingestion_jobs` remains the durable source of truth while BullMQ is only the execution transport. `@kb/ingestion` owns parser/chunker/orchestration and Drizzle persistence, `@kb/ai-providers` owns embedding provider calls and secret decryption, `@kb/search` owns keyword index writing, `@kb/queue` owns BullMQ producer options, and `src/apps/worker` owns worker lifecycle/recovery.

**Tech Stack:** TypeScript, Vitest, Drizzle/PostgreSQL, pgvector, S3-compatible storage, BullMQ/Redis, provider-compatible embedding APIs, Meilisearch HTTP API, pnpm workspace packages.

---

### Task 1: Config, Queue, And Storage Contracts

**Files:**
- Modify: `src/packages/config/src/index.ts`
- Modify: `src/packages/config/src/index.test.ts`
- Modify: `.env.example`
- Modify: `src/apps/api/.env.example`
- Modify: `src/apps/worker/.env.example`
- Modify: `src/packages/storage/src/index.ts`
- Modify: `src/packages/storage/src/index.test.ts`
- Modify: `src/packages/queue/src/index.ts`
- Modify: `src/packages/queue/src/index.test.ts`
- Modify: `src/packages/queue/package.json`

- [ ] **Step 1: Write failing tests**

Add config assertions for:
- `INGESTION_QUEUE_ATTEMPTS` default `3`.
- `INGESTION_QUEUE_BACKOFF_MS` default `5000`.
- `INGESTION_REQUEUE_STALE_AFTER_MS` default `300000`.
- `INGESTION_REQUEUE_BATCH_SIZE` default `100`.
- `INGESTION_PARSER_CONCURRENCY` default `2`.
- `INGESTION_EMBEDDING_CONCURRENCY` default `1`.
- `INGESTION_INDEX_CONCURRENCY` default `1`.
- `INGESTION_CHUNK_SIZE` default `1000`.
- `INGESTION_CHUNK_OVERLAP` default `150`.

Add queue assertions for:
- file ingestion payload includes `ingestionJobId`.
- `createIngestionJobOptions` returns `attempts`, exponential `backoff.delay`, stable `jobId`, `removeOnComplete.count = 1000`, and `removeOnFail.count = 5000`.

Add storage assertions for:
- `ObjectStorageClient.getObject` returns bytes and metadata through the package boundary.

- [ ] **Step 2: Run red tests**

Run:
- `pnpm --filter @kb/config test -- src/index.test.ts`
- `pnpm --filter @kb/queue test -- src/index.test.ts`
- `pnpm --filter @kb/storage test -- src/index.test.ts`

Expected: tests fail because ingestion config, queue options, and `getObject` are not implemented.

- [ ] **Step 3: Implement contracts**

Add validated config keys, env examples, queue option helpers and producer interface, and S3 `GetObjectCommand` support. Keep Redis/BullMQ construction inside `@kb/queue`.

- [ ] **Step 4: Run green tests**

Run the same three package tests. Expected: all pass.

### Task 2: Parser, Normalizer, And Chunker

**Files:**
- Modify: `src/packages/ingestion/src/index.ts`
- Modify: `src/packages/ingestion/src/index.test.ts`
- Modify: `src/packages/ingestion/package.json`

- [ ] **Step 1: Write failing tests**

Cover:
- Markdown chunks prefer headings/paragraph/list boundaries.
- TXT chunks prefer paragraph and sentence boundaries.
- hard character fallback still respects `chunkSize` and `chunkOverlap`.
- empty text-layer PDF extraction fails with `PARSE_EMPTY_TEXT`.
- unsupported MIME type fails with `UNSUPPORTED_DOCUMENT_TYPE`.

- [ ] **Step 2: Run red tests**

Run: `pnpm --filter @kb/ingestion test -- src/index.test.ts`

Expected: parser/chunker exports do not exist.

- [ ] **Step 3: Implement parser/chunker**

Add typed parser, normalizer, deterministic chunker, content hash generation, and PDF parsing through `pdf-parse`. OCR is not added.

- [ ] **Step 4: Run green tests**

Run the ingestion package test. Expected: parser/chunker tests pass.

### Task 3: Embedding And Search Boundaries

**Files:**
- Modify: `src/packages/ai-providers/src/index.ts`
- Modify: `src/packages/ai-providers/src/service.ts`
- Modify: `src/packages/ai-providers/src/service.test.ts`
- Modify: `src/packages/search/src/index.ts`
- Modify: `src/packages/search/src/index.test.ts`
- Modify: `src/packages/search/package.json`

- [ ] **Step 1: Write failing tests**

Cover:
- missing or disabled embedding config returns `EMBEDDING_PROVIDER_NOT_CONFIGURED`.
- embedding service decrypts the configured provider secret only inside `@kb/ai-providers`.
- OpenAI-compatible embedding responses produce stable vectors, provider id, model id, and dimension metadata.
- search documents use stable ids containing tenant, KB, document, version, and chunk index.

- [ ] **Step 2: Run red tests**

Run:
- `pnpm --filter @kb/ai-providers test -- src/service.test.ts`
- `pnpm --filter @kb/search test -- src/index.test.ts`

Expected: embedding and index writer exports do not exist.

- [ ] **Step 3: Implement boundaries**

Add an embedding service with provider config lookup, secret decryption, safe error normalization, and batch request support. Add a Meilisearch index writer with stable document ids and tenant/knowledge-base filter fields.

- [ ] **Step 4: Run green tests**

Run the same provider/search tests. Expected: all pass.

### Task 4: Ingestion Orchestration And DB Persistence

**Files:**
- Modify: `src/packages/ingestion/src/index.ts`
- Modify: `src/packages/ingestion/src/index.test.ts`
- Modify: `src/packages/ingestion/package.json`

- [ ] **Step 1: Write failing tests**

Cover:
- worker claim changes only `queued`/`retrying` jobs to `running`.
- duplicate claims return `already_claimed`.
- chunk/embedding persistence deletes/replaces the same document-version output set before inserting new rows.
- final document status update is guarded by document version.
- a missing embedding provider fails the job/document without marking it ready.

- [ ] **Step 2: Run red tests**

Run: `pnpm --filter @kb/ingestion test -- src/index.test.ts`

Expected: orchestration and repository exports do not exist.

- [ ] **Step 3: Implement orchestration**

Add `createIngestionPipeline`, `createDrizzleIngestionRepository`, source loading from `document_sources`, step logs, idempotent chunk/embedding persistence, final status transitions, and recovery payload rebuilding.

- [ ] **Step 4: Run green tests**

Run the ingestion package test. Expected: orchestration tests pass.

### Task 5: Upload-To-Queue Handoff

**Files:**
- Modify: `src/packages/knowledge/src/service-types.ts`
- Modify: `src/packages/knowledge/src/operations/upload-document-file.ts`
- Modify: `src/packages/knowledge/package.json`
- Modify: `src/apps/api/src/runtime-services.ts`
- Modify: `src/apps/api/src/runtime-services.test.ts`
- Modify: `src/apps/api/package.json`

- [ ] **Step 1: Write failing tests**

Cover:
- successful non-duplicate upload enqueues a file ingestion payload after finalization.
- enqueue failure marks the persisted job `retrying` with `QUEUE_ENQUEUE_FAILED`.
- duplicate upload does not enqueue a second BullMQ job.
- API runtime wires the queue producer from `REDIS_URL`.

- [ ] **Step 2: Run red tests**

Run:
- `pnpm --filter @kb/knowledge test`
- `pnpm --filter @kb/api test -- src/runtime-services.test.ts`

Expected: enqueue producer is not wired.

- [ ] **Step 3: Implement handoff**

Inject `IngestionQueueProducer` into the knowledge service. Build payloads from persisted source/job metadata, use the stable job id helper, update recoverable queue errors on failure, and close producer resources in API runtime shutdown.

- [ ] **Step 4: Run green tests**

Run the same knowledge/API tests. Expected: all pass.

### Task 6: Worker Processor And Recovery

**Files:**
- Modify: `src/apps/worker/src/lifecycle.ts`
- Modify: `src/apps/worker/src/index.ts`
- Modify: `src/apps/worker/src/lifecycle.test.ts`
- Modify: `src/apps/worker/package.json`

- [ ] **Step 1: Write failing tests**

Cover:
- worker starts BullMQ ingestion processing with configured concurrency.
- worker validates payloads before calling the pipeline.
- worker startup recovery requeues stale `queued`/`retrying` jobs.
- `stop()` closes workers, queue events, producer, Redis, and database runtime.

- [ ] **Step 2: Run red tests**

Run: `pnpm --filter @kb/worker test`

Expected: lifecycle does not expose processor/recovery wiring.

- [ ] **Step 3: Implement worker runtime**

Add worker runtime services from config, BullMQ worker/QueueEvents lifecycle, startup and interval recovery, graceful shutdown, and structured logs with `jobId`, `tenantId`, `knowledgeBaseId`, and `documentId`.

- [ ] **Step 4: Run green tests**

Run the worker package test. Expected: lifecycle and recovery tests pass.

### Task 7: Verification

**Files:**
- Modify: package manifests and `pnpm-lock.yaml` as dependencies change.
- Modify: `.trellis/tasks/05-24-document-ingestion-pipeline/prd.md` acceptance boxes when implementation is verified.

- [ ] **Step 1: Install/update workspace dependencies**

Run package-manager operations only for workspace-local dependencies:
- `pnpm --filter @kb/queue add bullmq ioredis`
- `pnpm --filter @kb/ingestion add @kb/db @kb/storage @kb/ai-providers @kb/search @kb/queue @kb/observability pdf-parse`
- `pnpm --filter @kb/ingestion add -D @types/pdf-parse`
- `pnpm --filter @kb/search add @kb/db`
- `pnpm --filter @kb/worker add @kb/config @kb/db @kb/storage @kb/ai-providers @kb/search @kb/ingestion @kb/config bullmq ioredis`
- `pnpm --filter @kb/api add @kb/queue`
- `pnpm --filter @kb/knowledge add @kb/queue`

- [ ] **Step 2: Run focused checks**

Run:
- `pnpm --filter @kb/config test`
- `pnpm --filter @kb/storage test`
- `pnpm --filter @kb/queue test`
- `pnpm --filter @kb/ai-providers test`
- `pnpm --filter @kb/search test`
- `pnpm --filter @kb/ingestion test`
- `pnpm --filter @kb/knowledge test`
- `pnpm --filter @kb/api test`
- `pnpm --filter @kb/worker test`

- [ ] **Step 3: Run repo gates**

Run:
- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`

Expected: all pass, or any environment-dependent integration gate is explicitly reported with the blocking reason.
