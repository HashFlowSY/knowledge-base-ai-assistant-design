# Backend Performance Guidelines

## Parallelize Independent Work

Use `Promise.all` for independent operations.

```typescript
const [knowledgeBase, members, recentJobs] = await Promise.all([
  getKnowledgeBase(id),
  listKnowledgeBaseMembers(id),
  listRecentIngestionJobs(id),
]);
```

Use `Promise.allSettled` when partial failure is acceptable and must be reported.

## Control External Concurrency

Use explicit concurrency limits for:

- Embedding calls.
- Rerank calls.
- Chat provider calls.
- URL fetching.
- Meilisearch bulk indexing.
- Object storage transfers.

Keep concurrency settings configurable and validated.

## Retries and Backoff

Use bounded retries with exponential backoff and jitter for transient failures.

Retryable examples:

- Provider rate limits.
- Temporary network failures.
- Meilisearch temporary unavailability.
- Object storage transient failures.

Non-retryable examples:

- Invalid provider credentials.
- Authorization failures.
- Unsupported file type.
- Validation errors.

## Caching

Use Redis cache-aside only when it has a clear benefit.

Good candidates:

- Session or auth-adjacent lookups when safe.
- Provider health/status probes.
- Expensive permission summaries.
- Stable system settings.

Avoid caching:

- Raw prompt content.
- Full model responses by default.
- Sensitive provider secrets.
- Authorization results without clear invalidation.

## Worker Idempotency

BullMQ jobs must tolerate retries.

Use one or more of:

- Stable job ids.
- Source hashes.
- Document version ids.
- Upsert writes.
- Step status records.
- Idempotency keys for external side effects.

Record enough job state to resume or explain failure:

- Current step.
- Retry count.
- Last error code/message.
- Timestamps.
- Related document and knowledge base ids.

