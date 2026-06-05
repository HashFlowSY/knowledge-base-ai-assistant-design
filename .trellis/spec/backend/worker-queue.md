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

## Scenario: Retry retained BullMQ failed ingestion jobs

### 1. Scope / Trigger

- Trigger: manual or recovery-driven retry of a persisted ingestion job whose
  deterministic BullMQ job id may still exist in the `failed` set.
- Scope: `@kb/queue` ingestion producer and callers that mark PostgreSQL
  ingestion jobs `queued` or `retrying` before asking Redis to schedule work.

### 2. Signatures

- Producer contract:
  ```typescript
  interface IngestionQueueProducer {
    enqueue(payload: IngestionJobPayload): Promise<void>;
  }
  ```
- BullMQ retained failed-job cleanup:
  ```typescript
  await job.remove();
  await queue.add(payload.type, payload, options);
  ```

### 3. Contracts

- `@kb/queue` owns the Redis/BullMQ decision. Callers should not duplicate
  BullMQ state branching in API or domain packages.
- The producer must compute the stable job id from the parsed
  `IngestionJobPayload` before enqueueing.
- If a retained BullMQ job with the same job id is in `failed`, the producer
  must remove that old Redis job before calling `queue.add` with the current
  parsed payload and options.
- PostgreSQL remains the business source of truth; callers must transition the
  persisted ingestion job to a worker-claimable state (`queued` or `retrying`)
  before invoking the producer.

### 4. Validation & Error Matrix

| Condition | Required outcome |
| --- | --- |
| Same stable job id exists in BullMQ `failed` | `job.remove()` first, then normal `queue.add` with the current payload |
| Same stable job id does not exist in BullMQ | Normal `queue.add` with bounded attempts/backoff and stable `jobId` |
| Same stable job id is waiting, delayed, active, or completed | Normal `queue.add`; BullMQ stable id deduplication remains the guard |
| BullMQ remove/add throws | Propagate the error so the caller can mark the persisted job retryable or enqueue-failed |

### 5. Good/Base/Bad Cases

- Good: manual retry marks the database row `queued`, then producer removes the
  retained failed BullMQ job and enqueues the current payload.
- Base: new upload has no retained failed BullMQ job and uses `queue.add`.
- Bad: manual retry calls `retry("failed")` on the retained Redis job and reuses
  stale Redis data instead of the current payload.

### 6. Tests Required

- Unit test `@kb/queue` producer behavior with a mocked BullMQ queue:
  same job id in `failed` calls `remove()` and then calls `add` with the current
  payload.
- Unit test normal producer behavior:
  no retained failed job calls `add` with expected attempts, backoff, retention,
  and stable `jobId`.
- Recovery or service tests may continue to assert PostgreSQL transitions and
  caller error handling without mocking BullMQ internals.

### 7. Wrong vs Correct

#### Wrong

```typescript
await queue.add(name, payload, createIngestionJobOptions(payload, config));
```

#### Correct

```typescript
const options = createIngestionJobOptions(payload, config);
const existingJob = await queue.getJob(options.jobId);
if ((await existingJob?.getState()) === "failed") {
  await existingJob.remove();
}
await queue.add(name, payload, options);
```

## Scenario: Align persisted ingestion state with BullMQ job state

### 1. Scope / Trigger

- Trigger: any BullMQ ingestion processor that calls a package pipeline returning
  a typed success/failure result instead of throwing directly.
- Scope: `src/apps/worker`, `src/packages/ingestion`, `src/packages/knowledge`,
  and `@kb/queue` attempts/backoff configuration.

### 2. Signatures

- Pipeline result:
  ```typescript
  type IngestionPipelineResult =
    | { status: "completed" }
    | { status: "skipped"; reason: "already_claimed" }
    | {
        status: "failed";
        code: string;
        message: string;
        retryable: boolean;
        shouldRetry: boolean;
      };
  ```
- Persisted job context must expose the incremented `attempts` and persisted
  `maxAttempts` for the claimed PostgreSQL job.

### 3. Contracts

- PostgreSQL remains the durable source of ingestion truth, but BullMQ state must
  not contradict it for active retry/failure decisions.
- A retryable pipeline failure before `maxAttempts` writes
  `ingestion_jobs.status = "retrying"` and the worker must throw a normal error
  so BullMQ applies attempts/backoff.
- A non-retryable or exhausted failure writes `ingestion_jobs.status = "failed"`
  and the worker must throw an unrecoverable/final failure so BullMQ does not
  keep retrying.
- Duplicate deliveries that cannot claim the persisted job return
  `{ status: "skipped", reason: "already_claimed" }` and may resolve normally.
- New upload-created ingestion jobs must persist `max_attempts` from the same
  config value used for BullMQ `attempts`, unless intentionally relying on the
  database default in a test/no-producer runtime.

### 4. Validation & Error Matrix

| Condition | Required outcome |
| --- | --- |
| Pipeline returns `failed` with `shouldRetry: true` | DB job is `retrying`; BullMQ attempt is failed/delayed, not completed |
| Pipeline returns `failed` with `shouldRetry: false` | DB job is `failed`; BullMQ job is failed, not completed |
| Processor returns a failed result normally | Test failure; this creates DB/Redis split-brain |
| Missing or disabled embedding provider reaches max attempts | DB and BullMQ both end failed |
| Duplicate delivery cannot claim job | Processor resolves skipped without side effects |

### 5. Good/Base/Bad Cases

- Good: worker maps failed pipeline results to thrown BullMQ errors after the
  pipeline has recorded persisted job state.
- Base: duplicate delivery resolves skipped because no business failure occurred.
- Bad: worker returns `{ status: "failed" }` to BullMQ; BullMQ stores the job in
  `completed` while PostgreSQL stores `retrying`.

### 6. Tests Required

- Unit test that retryable failure before max attempts returns
  `shouldRetry: true` and records a retrying failure input.
- Unit test that retryable failure at max attempts returns `shouldRetry: false`
  and records a final failure input.
- Worker unit test that failed pipeline results throw instead of resolving.
- Upload reservation or service wiring test that configured queue attempts become
  persisted `ingestion_jobs.max_attempts`.

### 7. Wrong vs Correct

#### Wrong

```typescript
new Worker("ingestion", async (job) => {
  return pipeline.processFileIngestion(job.data);
});
```

#### Correct

```typescript
new Worker("ingestion", async (job) => {
  const result = await pipeline.processFileIngestion(job.data);
  if (result.status === "failed") {
    throw result.shouldRetry
      ? new Error(result.message)
      : new UnrecoverableError(result.message);
  }

  return result;
});
```

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

## Scenario: Shared BullMQ Redis connection options

### 1. Scope / Trigger

- Trigger: any producer, worker, queue event listener, recovery path, or future queue helper that creates a BullMQ connection from `REDIS_URL`.
- Owner: `@kb/queue` owns Redis URL parsing and BullMQ connection option shape.

### 2. Signatures

- `createBullMqConnectionOptions(redisUrl: string): BullMqConnectionOptions`
- `BullMqConnectionOptions` includes `host`, `port`, `maxRetriesPerRequest: null`, and optional `db`, `username`, and `password`.

### 3. Contracts

- Producers and workers must import the helper from `@kb/queue` or an allowed queue subpath rather than duplicating Redis URL parsing.
- Empty Redis DB path omits `db`; non-empty path parses to a numeric DB.
- Username and password are URL-decoded.
- Missing port defaults to `6379`.
- `maxRetriesPerRequest` must be `null` for BullMQ worker compatibility.

### 4. Validation & Error Matrix

| Condition | Required outcome |
| --- | --- |
| `redis://localhost:6379` | `{ host: "localhost", port: 6379, maxRetriesPerRequest: null }` |
| `redis://worker:secret%20value@localhost:6380/2` | Decoded username/password and `db: 2` |
| Invalid Redis URL | Let `new URL()` fail during config/startup |

### 5. Good/Base/Bad Cases

- Good: API producer and worker both call `createBullMqConnectionOptions(config.REDIS_URL)`.
- Base: tests assert decoded credentials and DB path handling.
- Bad: worker and producer each define private `createBullMqConnectionOptions` functions.

### 6. Tests Required

- Queue unit tests assert parsing of host, port, db, username, password, and `maxRetriesPerRequest`.
- Worker typecheck must pass after replacing local connection parsing.

### 7. Wrong vs Correct

#### Wrong

```typescript
const url = new URL(config.REDIS_URL);
const connection = { host: url.hostname, port: Number(url.port || 6379) };
```

#### Correct

```typescript
const connection = createBullMqConnectionOptions(config.REDIS_URL);
```
