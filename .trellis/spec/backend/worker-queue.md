# Worker and Queue Guidelines

These rules define BullMQ and Redis usage for `src/apps/worker` and `src/packages/queue`.

## Ownership

- `src/packages/queue` owns queue names, job schemas, producer helpers, and shared queue configuration.
- `src/apps/worker` owns worker process lifecycle and processors.
- `src/packages/ingestion` owns ingestion pipeline behavior.
- API routes enqueue jobs; they do not execute ingestion work inline.

## Queue Names

Use stable queue names:

| Queue | Purpose |
| --- | --- |
| `ingestion` | File and URL document ingestion |
| `maintenance` | Cleanup, health probes, periodic maintenance |

Add new queues only when concurrency, retry, or ownership requirements differ materially.

## Job Types

Use discriminated Zod schemas for job payloads.

```typescript
type IngestionJobPayload =
  | {
      type: "file_ingestion";
      ingestionJobId: string;
      tenantId: string;
      knowledgeBaseId: string;
      documentId: string;
      documentVersion: string;
      sourceObjectKey: string;
      requestedBy: string;
    }
  | {
      type: "url_ingestion";
      ingestionJobId: string;
      tenantId: string;
      knowledgeBaseId: string;
      documentId: string;
      documentVersion: string;
      sourceUrl: string;
      requestedBy: string;
    };
```

Every job payload must include:

- `type`
- `tenantId`
- `knowledgeBaseId` when applicable
- `documentId` when applicable
- `documentVersion` when applicable
- `ingestionJobId` for the persisted PostgreSQL job row
- `requestedBy` for user-triggered jobs

System or maintenance jobs that do not have a direct user actor must use an
explicit system actor contract instead of inventing a placeholder user id:

```typescript
type SystemJobActor = {
  actorType: "system";
  requestedBy?: null;
};
```

User-requested jobs must preserve `requestedBy` through persisted job state,
worker logs, and audit metadata.

## Job IDs and Idempotency

Use stable job ids when duplicate work should collapse.

Recommended ingestion job id:

```text
ingestion__{encodeURIComponent(tenantId)}__{encodeURIComponent(documentId)}__{encodeURIComponent(documentVersion)}
```

Do not use `:` in BullMQ custom `jobId` values. BullMQ 5.x rejects many custom
ids containing colons during `Job.validateOptions`, so `@kb/queue` must produce
BullMQ-safe stable ids through `createIngestionJobId`.

Workers must tolerate retries:

- Use document version or source hash.
- Use upserts for deterministic records.
- Record step status before and after each pipeline step.
- Do not duplicate chunks, embeddings, or search documents for the same document version.

## Retry Policy

Use bounded retries.

Recommended defaults:

- Attempts: `3`.
- Backoff: exponential with jitter.
- Retry transient provider, network, object storage, Redis, Meilisearch, and database connection failures.
- Do not retry validation errors, unsupported file types, unauthorized access, blocked URLs, or invalid provider credentials.

When retries are exhausted:

- Mark ingestion job `failed`.
- Persist normalized error code and message.
- Write an ingestion job log entry.
- Emit structured log with `jobId`, `tenantId`, `knowledgeBaseId`, `documentId`, and error code.

## Concurrency

Concurrency must be configurable.

Separate limits for:

- Worker concurrency.
- Parser concurrency.
- Embedding concurrency.
- Meilisearch indexing concurrency.
- Provider request concurrency.

Provider and indexing limits must be lower than worker concurrency when external systems are the bottleneck.

## Job State

Persist job state in database, not only in Redis.

Track:

- `tenantId`
- `knowledgeBaseId`
- `documentId`
- `status`
- `currentStep`
- `attempts`
- `lastErrorCode`
- `lastErrorMessage`
- `createdAt`
- `updatedAt`
- `startedAt`
- `finishedAt`

Use `ingestion_job_logs` for step-level logs:

- step name
- status
- message
- metadata
- timestamp

Do not store full chunk content, prompt text, provider keys, or full provider responses in job logs.

## Worker Shutdown

Workers must support graceful shutdown:

- Stop accepting new jobs.
- Let active jobs finish within a timeout.
- Close BullMQ workers and Redis connections.
- Log shutdown reason and active job count.

## API Behavior

Upload and URL import APIs should:

1. Validate input.
2. Create document/source records.
3. Create persisted ingestion job record.
4. Enqueue BullMQ job.
5. Return job id and document id.

APIs must not parse documents, generate embeddings, or write search indexes synchronously.

## Database and Queue Consistency

Creating business records and enqueueing BullMQ work crosses the PostgreSQL/Redis
boundary and must have a visible consistency strategy.

Required behavior:

- Persist a job record before or atomically with the enqueue decision.
- If enqueue fails after database commit, leave the persisted job in an explicit
  `enqueue_failed` or retryable pending state.
- Provide a recovery path, such as an outbox table, periodic reconciler, or
  operator-triggered requeue command.
- Do not report a job as ready to the client unless the API can return a durable
  job id and the recovery path can find unfinished work.
- Object storage writes that happen before enqueue must have cleanup or retry
  handling so orphaned objects are visible.

Validation and error matrix:

| Condition | Required outcome |
| --- | --- |
| Database transaction fails | No BullMQ job is enqueued |
| BullMQ enqueue fails after database commit | Persisted job is marked retryable/pending and logged with `jobId` |
| Duplicate enqueue for same document version | Stable job id collapses duplicate work |
| Recovery requeues stale pending job | Worker idempotency prevents duplicate chunks, embeddings, search docs, and audit events |

## Scenario: BullMQ-safe stable ingestion job ids

### 1. Scope / Trigger

- Trigger: any producer or recovery path enqueuing ingestion work into BullMQ.
- Scope: `@kb/queue`, API upload enqueue, worker startup/periodic recovery.

### 2. Signatures

- `createIngestionJobId(payload: IngestionJobPayload): string`
- `createIngestionJobOptions(payload, config).jobId`

### 3. Contracts

- The returned `jobId` must be deterministic for the same tenant, document, and
  document version.
- The returned `jobId` must not contain `:`.
- Components must be URI-encoded before joining.

### 4. Validation & Error Matrix

| Condition | Required outcome |
| --- | --- |
| Same tenant/document/version enqueued twice | Same BullMQ `jobId` collapses duplicate work |
| Tenant/document/version contains unsafe URL characters | Component is URI-encoded before joining |
| Generated `jobId` contains `:` | Unit test failure; do not enqueue |

### 5. Good/Base/Bad Cases

- Good: `ingestion__tenant_1__doc_1__1`
- Base: `ingestion__tenant%3A1__doc%2F1__1`
- Bad: `ingestion:tenant_1:doc_1:1`

### 6. Tests Required

- Unit test `createIngestionJobId` output is stable and has no colon.
- Unit test `createIngestionJobOptions` uses the same stable id.
- Recovery/upload handoff tests must assert duplicate enqueue uses the helper,
  not hand-written id strings.

### 7. Wrong vs Correct

#### Wrong

```typescript
const jobId = `ingestion:${tenantId}:${documentId}:${documentVersion}`;
```

#### Correct

```typescript
const jobId = createIngestionJobId(payload);
```
