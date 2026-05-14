# Cross-Layer Thinking Guide

> **Purpose**: Think through data flow across the knowledge-base AI assistant before implementing cross-layer work.

This is a thinking guide, not a code-spec. Use it to decide what contracts to inspect or update. Put concrete signatures, schemas, error codes, and tests in the relevant backend, frontend, testing, or ops spec.

---

## The Problem

Most serious bugs in this project happen when data crosses boundaries:

- Upload API accepts metadata that the worker cannot process.
- Ingestion persists chunks without the fields RAG citations need.
- Retrieval filters correctly in PostgreSQL but not in Meilisearch.
- Provider adapters normalize errors differently than API and UI expect.
- Backend returns `Date` objects or snake_case fields while the frontend expects ISO strings and camelCase.
- Audit logs capture too much content or miss required actor/request context.

Before changing behavior that touches more than one app/package, trace the full path and identify the owner of every contract.

---

## When To Use This Guide

Use this guide when work touches any of:

- `src/apps/web` plus `src/apps/api`.
- API plus domain packages.
- API or worker plus database schema.
- Ingestion pipeline, object storage, queue, provider, and search together.
- RAG retrieval, provider calls, chat persistence, citations, and feedback.
- Auth, tenant scope, knowledge-base authorization, or audit logging.
- Environment config that affects multiple runtime services.
- List/table state shared between URL, frontend hooks, and API pagination/filtering.

If the feature spans 3+ layers, write or update a flow note in the task before coding.

---

## Step 1: Map The Flow

Write the flow in project terms, not generic layers.

Examples:

```text
web upload form -> API validation -> knowledge package -> storage metadata
  -> object storage -> queue job -> worker -> ingestion pipeline
  -> chunks/embeddings -> Meilisearch -> task status UI
```

```text
chat UI -> API chat route -> auth and knowledge-base permission check
  -> rag package -> pgvector + Meilisearch -> rerank provider
  -> chat provider -> message/citation persistence -> stream/UI rendering
```

For each arrow, answer:

- What fields move across this boundary?
- Which schema validates them?
- Which package owns the type?
- Which IDs must be present (`tenantId`, `actorId`, `knowledgeBaseId`, `documentId`, `requestId`, `jobId`)?
- What is persisted, what is derived, and what is only display state?
- What must never cross the boundary, such as raw secrets, full prompts, full chunks, or full model responses?

---

## Step 2: Identify Contract Owners

Use these default owners unless a more specific spec says otherwise.

| Contract | Owner | Specs To Read |
| --- | --- | --- |
| API request/response shape | `src/apps/api` domain module or shared API contract | `backend/api-contract.md`, `backend/api-module.md`, `shared/typescript.md` |
| Frontend query/list state | `src/apps/web` feature module | `frontend/state-management.md`, `frontend/lists.md`, `frontend/hook-guidelines.md` |
| Database schema and row types | `src/packages/db` | `backend/database.md`, `backend/timestamps.md` |
| Knowledge-base permissions | `src/packages/knowledge` and API auth layer | `backend/security.md`, `backend/package-boundaries.md` |
| Queue job payloads | `src/packages/queue` | `backend/worker-queue.md` |
| Ingestion steps and document processing | `src/packages/ingestion` | `backend/rag-ingestion.md`, `backend/storage.md` |
| Retrieval, citations, and feedback | `src/packages/rag` | `backend/rag-ingestion.md`, `backend/ai-provider.md` |
| Provider calls and normalized errors | `src/packages/ai-providers` | `backend/ai-provider.md`, `backend/api-contract.md` |
| Audit events and redaction | `src/packages/audit` | `backend/audit.md`, `backend/logging.md`, `backend/security.md` |
| Runtime config and secrets | `src/packages/config` | `shared/config.md`, `ops/deployment.md` |

Do not duplicate cross-layer types in consumers. Import or infer them from the owner package.

---

## Step 3: Check The Required IDs

Most cross-layer records must carry enough identity to enforce permissions, debug failures, and correlate logs.

Before implementation, verify:

- `tenantId` is present for every tenant-owned read/write and persisted job.
- `actorId` or `requestedBy` is present for user-initiated actions.
- `knowledgeBaseId` is present before document, chunk, retrieval, upload, and chat work.
- `documentId` and document version/source hash are present for ingestion idempotency.
- `requestId` is present for API logs, API errors, streaming events, and enqueued job metadata when available.
- `jobId` is present for worker logs, job state, and task-status UI.

If an ID is missing at one boundary, do not reconstruct it later from user-controlled input. Pass it explicitly from the owner boundary or load it through an authorized database lookup.

---

## High-Risk Project Flows

### 1. File Upload And Ingestion

Flow:

```text
web -> API -> knowledge/storage/db -> object storage -> queue -> worker
  -> parser -> normalizer -> chunker -> embedding provider -> pgvector/Meilisearch
```

Before implementing:

- [ ] API validates file size, MIME type, extension, parser support, and write permission before object write.
- [ ] Server generates object keys; clients never provide final object keys.
- [ ] Database source metadata and object storage write cannot drift without visible failure handling.
- [ ] Queue payload includes `tenantId`, `knowledgeBaseId`, `documentId`, idempotency fields, and `requestedBy` for user-triggered work.
- [ ] Worker writes step status before/after expensive stages.
- [ ] Chunk records contain citation metadata needed by RAG.
- [ ] Embedding and indexing steps deduplicate by document version or content hash.
- [ ] Task status and document logs can be rendered without reading raw chunk content.

After implementing:

- [ ] Retry does not duplicate chunks, embeddings, search documents, or audit events.
- [ ] Failed ingestion records normalized error code/message and is visible in the UI.
- [ ] Unauthorized users cannot infer object existence or document processing details.

### 2. URL Import

Flow:

```text
web URL form -> API SSRF validation -> queue -> worker fetch
  -> redirect validation -> parser -> ingestion pipeline
```

Before implementing:

- [ ] API and worker agree where URL validation happens and which checks are repeated before fetch.
- [ ] Redirects are revalidated at every hop.
- [ ] Final DNS/IP classification blocks localhost and private networks.
- [ ] Timeout, response size, and content type limits are configured and validated.
- [ ] Stored source metadata avoids leaking sensitive URL query strings in logs/audit where possible.

After implementing:

- [ ] Tests cover blocked private IPs, redirects to private IPs, oversized responses, unsupported content type, and retryable network failures.

### 3. RAG Chat And Citations

Flow:

```text
chat UI -> API -> auth/tenant/kb permission -> rag package
  -> pgvector + Meilisearch -> fusion -> rerank provider
  -> chat provider -> persistence -> stream response -> citations/feedback UI
```

Before implementing:

- [ ] Selected knowledge-base IDs are validated against actor permissions before retrieval.
- [ ] PostgreSQL and Meilisearch queries both apply tenant and knowledge-base filters.
- [ ] Retrieval candidates preserve `chunkId`, `documentId`, `knowledgeBaseId`, source locator, and snippet source.
- [ ] Rerank fallback behavior is explicit when the provider is unavailable.
- [ ] Chat provider receives only authorized context.
- [ ] Stream events and final persisted records use compatible message/citation IDs.
- [ ] Prompt, chunk content, and full model output are not logged by default.

After implementing:

- [ ] A user cannot retrieve or cite chunks from an unauthorized knowledge base.
- [ ] A streamed answer that fails during delivery still has a clear persistence outcome.
- [ ] Feedback records link to chat message, retrieval run, citations, actor, and tenant.

### 4. Provider Configuration And Secrets

Flow:

```text
admin UI -> API validation/authz -> provider config package
  -> encryption helper -> database -> audit -> provider health/status
```

Before implementing:

- [ ] Only admin routes can create, update, disable, or status-check provider configs.
- [ ] Secret values are encrypted before persistence and never returned to API clients.
- [ ] UI displays masked metadata, not decrypted keys.
- [ ] Provider package is the only boundary that decrypts keys for network calls.
- [ ] Provider internal error codes map to API error codes and Chinese UI copy.
- [ ] Audit metadata records provider type/model/status, not key material.

After implementing:

- [ ] Logs, traces, health responses, audit metadata, and API responses redact secrets.
- [ ] Invalid/disabled provider configs fail before network calls.

### 5. Lists, Filters, And Pagination

Flow:

```text
URL query params -> frontend hooks -> Hono RPC/API
  -> API validation -> database query -> PageResult/cursor result -> table UI
```

Before implementing:

- [ ] URL state includes every user-controlled list input: page, page size, search, sort, and filters.
- [ ] Query keys include every input that changes the response.
- [ ] API owns filtering, sorting, pagination semantics, and authorization filtering.
- [ ] Response shape matches `PageResult<T>` or a documented cursor contract.
- [ ] Backend uses camelCase API fields and ISO timestamp strings.
- [ ] High-volume audit/log lists avoid rendering huge metadata inline.

After implementing:

- [ ] Changing search/filter/sort resets `page` to `1`.
- [ ] Admin-only rows/actions are still rejected by the API when called directly.

### 6. Audit And Observability

Flow:

```text
API/worker/domain action -> structured logger/tracer -> audit package
  -> database -> admin audit list UI
```

Before implementing:

- [ ] Security-sensitive mutation has an audit action name and target.
- [ ] Logs include relevant `requestId`, `jobId`, `tenantId`, `actorId`, `knowledgeBaseId`, `documentId`, and `action`.
- [ ] Worker/system actions use `actorType: "system"` when no user directly executes the step.
- [ ] User-requested worker jobs preserve `requestedBy` in metadata.
- [ ] Redaction happens before logs, spans, audit metadata, or health responses are emitted.

After implementing:

- [ ] Audit list APIs require admin authorization and tenant filtering.
- [ ] Audit metadata is useful for operations without storing full prompts, chunks, documents, model outputs, or secrets.

---

## Common Cross-Layer Mistakes

### Mistake 1: Permission Filter Drift

**Wrong**: Apply tenant and knowledge-base filters in pgvector retrieval but forget equivalent Meilisearch filters.

**Correct**: Treat authorization filters as part of the retrieval contract. Verify every retrieval backend applies them before results return to application code.

### Mistake 2: Frontend-Owned Backend Semantics

**Wrong**: Let frontend table code decide which records a member can see or how audit filters work.

**Correct**: Frontend owns controls and URL state. API owns authorization, filtering, sorting, pagination, and search semantics.

### Mistake 3: Shape Duplication

**Wrong**: Redefine API response types, job payloads, provider responses, or citation shapes in each consumer.

**Correct**: Put schemas/types with the contract owner and import or infer them from consumers.

### Mistake 4: Content Leaks Through Debug Paths

**Wrong**: Include prompt text, chunk content, model response, signed URL, or provider raw error in logs because it helps debugging.

**Correct**: Log IDs, normalized error codes, durations, counts, provider/model metadata, and short safe summaries only.

### Mistake 5: Persisted State And Runtime State Drift

**Wrong**: Trust Redis/BullMQ job state as the only source of ingestion truth.

**Correct**: Persist job state and step logs in PostgreSQL so task pages, retries, and operations survive worker restarts.

### Mistake 6: Date And Naming Drift

**Wrong**: Return database rows directly to client components with snake_case fields or raw `Date` objects.

**Correct**: Convert at the API boundary to camelCase fields and ISO 8601 UTC strings.

---

## Pre-Implementation Checklist

- [ ] Flow mapped from UI/API/worker through packages, storage, database, providers, and UI output.
- [ ] Contract owner identified for every request, response, payload, row, event, and config value.
- [ ] Required IDs and authorization context are present at each boundary.
- [ ] Validation entry points and repeated safety checks are explicit.
- [ ] Error code mapping is defined from internal package errors to API responses and UI copy.
- [ ] Redaction rules are defined before adding logs, traces, audit metadata, or health output.
- [ ] Tests are identified at the right layer: unit for pure logic, integration for infrastructure, E2E for user-visible flow.

---

## Post-Implementation Checklist

- [ ] Data survives round-trip through the full flow without field loss or naming/date drift.
- [ ] Unauthorized tenant/knowledge-base access fails in every backend involved.
- [ ] Retry and partial failure behavior does not duplicate persisted records or side effects.
- [ ] API errors include `requestId` and use the project error contract.
- [ ] Frontend loading, empty, error, and permission states match API behavior.
- [ ] Logs, traces, audit records, and health responses expose enough operational context without sensitive content.
- [ ] Relevant specs were updated if a contract changed.

---

## When To Create Detailed Flow Documentation

Create a task-level flow note or spec update when:

- The feature spans API, worker, database, and frontend.
- The feature writes to both PostgreSQL and another system such as object storage, Redis, Meilisearch, or a provider.
- The feature changes auth, tenant scope, knowledge-base permissions, audit, or secret handling.
- The feature introduces a new job type, provider capability, ingestion step, retrieval stage, or list contract.
- A bug happened because two layers had different assumptions.
