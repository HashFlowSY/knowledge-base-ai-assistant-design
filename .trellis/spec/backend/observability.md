# Observability Guidelines

These rules define logging, tracing, and metrics expectations beyond basic structured logging.

## Ownership

- `src/packages/observability` owns logger, tracer, metrics helpers, and request context helpers.
- Apps and packages import observability helpers; they do not create incompatible logger/tracer implementations.

## Trace Boundaries

Create OpenTelemetry spans for:

- API requests.
- Database queries on hot paths.
- Redis/BullMQ operations.
- BullMQ job processing.
- Object storage reads/writes.
- Meilisearch indexing/search.
- pgvector retrieval.
- Provider chat, embedding, and rerank calls.
- URL ingestion fetches.
- Parser/chunker steps when they are expensive.

Use stable span names. These are the canonical names for project traces:

- `api.request`
- `db.query`
- `queue.job.process`
- `storage.object.get`
- `storage.object.put`
- `search.keyword`
- `search.vector`
- `provider.chat`
- `provider.embedding`
- `provider.rerank`
- `ingestion.parse`
- `ingestion.chunk`

More specific operation names may be added as span attributes, for example
`db.operation: "documents.list"` or `queue.name: "ingestion"`. Do not create a
second naming scheme such as `db.documents.list` unless the canonical table is
updated first.

## Metrics

Track at least:

- API request count, latency, and error count by route.
- Worker job count, duration, retry count, and failure count by job type.
- Provider latency, error count, and retry count by provider and operation.
- Ingestion duration by step.
- Search latency by vector/keyword/rerank phase.
- Object storage operation failures.

Do not include high-cardinality raw values such as full URL, prompt, object key, or user input as metric labels.

## Correlation IDs

Use `requestId` for request/response correlation.

Use `jobId` for worker correlation.

When an API enqueues a job:

- API log includes `requestId` and `jobId`.
- Persisted job includes `requestId` when available.
- Worker logs include `jobId` and original `requestId` when available.

## Redaction

Observability helpers must redact:

- `authorization`
- `cookie`
- provider keys
- object storage credentials
- database URLs
- encryption keys
- signed URL query strings

Redaction must happen before logs or spans are emitted.

## Local Development

Local development may output structured logs to console.

Logs should still be JSON-like and should not include sensitive content.
