# Logging and Observability Guidelines

## Structured Logs

Use structured logger calls instead of string interpolation.

Bad:

```typescript
logger.info(`Document ${documentId} processed`);
```

Good:

```typescript
logger.info("document_processed", {
  documentId,
  jobId,
  tenantId,
});
```

## Required Context

Include relevant context whenever available:

- `requestId`
- `method`
- `path`
- `tenantId`
- `actorId`
- `jobId`
- `knowledgeBaseId`
- `documentId`
- `providerId`
- `action`

## Request Context

API middleware should create request context before routing:

1. Generate or propagate `requestId`.
2. Create a request-scoped logger.
3. Attach method and path.
4. Set `X-Request-Id` on responses.
5. Log request completion and failures at an appropriate level.

After authentication, enrich logger context with `actorId` and `tenantId`.

## What to Log

Always log:

- Authentication and authorization failures.
- Admin operations.
- Provider key create/update/disable events, without secret values.
- Ingestion job lifecycle transitions.
- Queue retry exhaustion.
- External provider failures.
- Search and RAG pipeline failures.
- Database write failures.

Log carefully:

- User input summaries.
- Provider response metadata.
- Document names and source URLs.

Never log:

- Provider keys.
- Object storage credentials.
- Database URLs.
- Raw prompt content by default.
- Full chunk content by default.
- Full model output by default.

## OpenTelemetry

Create spans around expensive and failure-prone operations:

- Database queries in hot paths.
- Meilisearch indexing and search.
- pgvector retrieval.
- Provider embedding, rerank, and chat calls.
- BullMQ job execution.
- Object storage reads and writes.
- URL ingestion fetches.

Use the canonical span names from `observability.md`. Add domain-specific detail
as attributes instead of inventing incompatible span names:

- `db.query` with `db.operation: "documents.list"`
- `queue.job.process` with `queue.name: "ingestion"`
- `search.vector` with `rag.phase: "vector_search"`
- `search.keyword` with `rag.phase: "keyword_search"`
- `provider.embedding`
- `provider.rerank`
- `provider.chat`
- `storage.object.put`

## Errors

When logging `AppError`, log only fields validated by `@kb/errors` and never log
`responseHeaders`.

When logging ordinary `Error` or unknown values, do not write the raw
`error.message`, raw `error.stack`, or `String(error)` to log payloads. Upstream
libraries can include cookies, tokens, provider keys, request bodies, object
keys, SQL text, or document/chunk content inside exception messages.

Use `createSafeErrorLogFields` from `@kb/observability` with a hard-coded safe
message. Set `includeStack: true` only when the call site needs stack frames; the
helper rewrites the stack first line to the safe message and keeps only `at ...`
frames.

Wrong:

```typescript
logger.error("provider_call_failed", {
  providerId,
  operation: "chat",
  error: error instanceof Error ? error.message : String(error),
});
```

Correct:

```typescript
logger.error("provider_call_failed", {
  providerId,
  operation: "chat",
  ...createSafeErrorLogFields(error, {
    message: "Provider call failed.",
  }),
});
```

Re-throw errors when the caller must handle retry, rollback, or HTTP error mapping.

Tests for any new ordinary `Error` logging path must throw an error message that
contains at least one secret-like value, such as `token=secret_token`,
`requestBody={}`, or an object key, and assert that the serialized log records do
not contain that value.

## API Error Handler

The global API error handler should:

- Map validation errors to `VALIDATION_ERROR`.
- Map auth failures to `UNAUTHORIZED` or `FORBIDDEN`.
- Map missing records to `NOT_FOUND`.
- Include `requestId` in client-visible errors.
- Log unhandled errors with structured context.
- Avoid leaking stack traces or upstream secret-bearing payloads.
