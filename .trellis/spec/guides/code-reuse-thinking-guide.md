# Code Reuse Thinking Guide

> **Purpose**: Stop before creating new code and decide whether the project already has an owner, contract, pattern, or shared boundary for it.

This is a thinking guide, not a code-spec. Use it to find reuse opportunities and the right owner. Put concrete APIs, schemas, and implementation rules in the relevant spec file.

---

## The Problem

In this project, duplicated code usually becomes a production bug because the same rule must hold across API, worker, packages, and UI.

High-risk duplication examples:

- Rewriting tenant or knowledge-base permission checks in multiple packages.
- Redefining API request/response types in frontend hooks.
- Copying list pagination, sorting, and filter logic across pages.
- Duplicating queue payload shapes between API producers and workers.
- Repeating provider timeout, retry, and error normalization logic per vendor.
- Recreating ingestion step status handling in each parser or connector.
- Scattering Chinese UI copy and error messages across components.
- Copying redaction rules in logging, audit, health, and provider code.

Reuse in this project should preserve ownership and dependency direction. Do not create a shared utility just because two files look similar if it would blur domain boundaries.

---

## Before Writing New Code

### Step 1: Search First

Use `rg` before creating a function, schema, hook, component, constant, or copy string.

```bash
rg "knowledgeBaseId|tenantId|requestedBy|PageResult|ApiErrorResponse" src .trellis/spec docs
rg "provider|ingestion|citation|audit|permission" src .trellis/spec docs
```

Search by:

- Domain noun: `knowledge base`, `document`, `provider`, `audit`, `ingestion`.
- Technical contract: `PageResult`, `ApiErrorResponse`, `IngestionJobPayload`, `RetrievalCandidate`.
- Required IDs: `tenantId`, `actorId`, `knowledgeBaseId`, `documentId`, `requestId`, `jobId`.
- UI copy term: `知识库`, `处理日志`, `模型服务`, `审计日志`.
- Error code: `FORBIDDEN`, `VALIDATION_ERROR`, `PROVIDER_UNAVAILABLE`, `INGESTION_FAILED`.

If the project is not scaffolded yet, search `.trellis/spec/` and design docs first, then create code in the owner location from the spec.

### Step 2: Identify The Owner

Ask:

- Is this a cross-layer type or schema? Put it with the contract owner and infer types from it.
- Is this domain behavior? Put it in the owning domain package, not an app.
- Is this infrastructure behavior? Put it in the infrastructure package.
- Is this UI-only layout or state? Keep it in the web feature or shared frontend component.
- Is this repeated copy? Put it in the feature copy module.
- Would extracting it create a dependency cycle? If yes, choose a narrower owner or define an interface.

Read:

- `backend/package-boundaries.md` for package ownership and dependency direction.
- `shared/typescript.md` for schema/type ownership.
- `frontend/state-management.md` and `frontend/lists.md` for list/query reuse.
- `backend/api-contract.md` for API shape reuse.

---

## Project Reuse Map

Use this map when deciding where repeated code belongs.

| Repeated Pattern | Prefer Owner | Avoid |
| --- | --- | --- |
| API input/output schemas | API domain module or shared API contract | Redefining response types in frontend hooks |
| Tenant and knowledge-base permission checks | `src/packages/knowledge` or API auth helpers; `src/packages/security` only for generic primitives | Inline checks scattered across API procedures |
| Auth/session normalization | `src/packages/auth` plus API middleware | Components or packages reading raw session shape directly |
| Database schema, row, insert types | `src/packages/db` | Hand-written row types in domain packages |
| Table-specific query helpers | Owning domain package or `db` helper | Repeating query conditions across packages |
| Queue names and job payloads | `src/packages/queue` | API and worker each defining payload types |
| Ingestion pipeline step contracts | `src/packages/ingestion` | Each parser inventing its own result shape |
| Provider interfaces and normalized errors | `src/packages/ai-providers` | Vendor clients leaking into RAG or ingestion |
| Search indexing/search helpers | `src/packages/search` | Direct Meilisearch calls from unrelated packages |
| Storage key generation and signed URLs | `src/packages/storage` | Client-provided keys or domain-local S3 clients |
| Audit action names and redaction | `src/packages/audit` | Ad hoc audit metadata in each route |
| Logger, tracer, redaction helpers | `src/packages/observability` | New logger implementations per app |
| Runtime config and secret redaction | `src/packages/config` | `process.env` reads in routes or domain packages |
| Frontend API hooks | Web feature hook modules | Raw `fetch` repeated in components |
| List/table layout patterns | Lightweight project list components | Adding a table state library by default |
| Chinese UI copy and API error copy | `src/apps/web/src/copy/*` | Inline strings scattered across components |

---

## Common Reuse Decisions

### 1. Validation Schemas And Types

Reuse rule:

- Define Zod schemas at boundaries.
- Infer TypeScript types from schemas.
- Import or infer types from the owner package.

Ask before adding a type:

- Does a schema already exist for this request, response, provider result, job payload, or config value?
- Is this type crossing app/package boundaries?
- Will another layer need the same validation or just the inferred shape?

Wrong:

```typescript
type ListDocumentsResponse = {
  items: DocumentRow[];
  page: number;
  pageSize: number;
  total: number;
};
```

Correct:

```typescript
export const listDocumentsResponseSchema = pageResultSchema(documentSchema);
export type ListDocumentsResponse = z.infer<typeof listDocumentsResponseSchema>;
```

Put the concrete schema pattern in the relevant API or shared TypeScript spec.

### 2. Permission And Scope Logic

Tenant and knowledge-base authorization is not a local helper to copy.

Before writing permission logic:

- Search for an existing knowledge-base permission helper in the domain owner.
- Check whether the operation needs `tenantId`, `actorId`, `knowledgeBaseId`, or `documentId`.
- Decide whether the rule belongs in `knowledge`, API middleware, or a route-level helper. Use `security` only for generic helpers that do not query domain data.
- Verify both SQL and Meilisearch retrieval paths can reuse the same authorization result.

Do not hide permission checks inside generic data mappers. Important authorization boundaries must be visible at API/package call sites.

### 3. API Procedures And Hooks

API modules should repeat a recognizable procedure shape, not copy large blocks.

Reuse:

- Shared request context helpers.
- Shared protected-route/auth narrowing helpers.
- Shared API error mapper.
- Domain-specific schemas in `types.ts`.
- Feature-scoped query and mutation hooks.

Do not reuse:

- One catch-all API procedure helper that hides validation, authorization, logging, and domain calls.
- Frontend hooks that take untyped bags of options.
- Raw `fetch` wrappers that bypass the Hono RPC contract without a documented reason.

### 4. List Pages

User management, task queue, document logs, audit logs, provider config lists, and knowledge-base lists should share list patterns.

Before implementing a new list:

- Search for existing URL-state parsing and serialization helpers.
- Reuse query key construction patterns.
- Reuse lightweight table/list layout components.
- Reuse empty, loading, error, pagination, and retry state patterns.
- Keep API pagination/filtering/search semantics on the backend.

Do not extract a generic table framework that owns business semantics. The reusable layer should handle layout and state wiring, not authorization or query meaning.

### 5. Ingestion Pipeline

Parsers and connectors should plug into shared pipeline contracts.

Before adding a parser, connector, or ingestion step:

- Reuse `SourcePayload`, parsed document, chunk, step status, and normalized error shapes.
- Reuse object key generation and storage metadata helpers.
- Reuse queue payload schemas and job id conventions.
- Reuse step logging and retry/idempotency helpers.
- Keep format-specific parsing local to the parser.

Do not copy the whole ingestion orchestration into a new connector. New sources should adapt into the existing connector boundary.

### 6. RAG And Search

Vector retrieval, keyword retrieval, fusion, rerank, citation assembly, and feedback should share contracts but keep responsibilities separate.

Before adding retrieval behavior:

- Search for existing candidate/result/citation shapes.
- Reuse tenant and knowledge-base filters across PostgreSQL and Meilisearch helpers.
- Reuse fusion and deduplication helpers when the scoring contract is the same.
- Reuse provider interfaces for rerank and chat calls.
- Reuse citation assembly rules so UI and persistence agree.

Do not call vendor SDKs from `rag` or `ingestion`. Provider calls go through `ai-providers`.

### 7. Provider Integrations

Providers differ at the adapter edge. Timeout, retry, usage, error normalization, and secret handling should be shared.

Before adding or changing a provider:

- Reuse provider interfaces for chat, embedding, and rerank.
- Reuse secret lookup/decryption boundaries.
- Reuse timeout, retry, and rate-limit helpers.
- Reuse normalized provider error codes.
- Reuse usage accounting shapes.

Keep vendor-specific request/response mapping inside the adapter. Do not leak vendor raw response shapes into RAG, ingestion, API, or UI.

### 8. Audit, Logging, And Redaction

Audit/log duplication often creates security defects.

Before adding logging or audit code:

- Search for existing action names.
- Reuse redaction helpers for secrets, signed URLs, prompts, chunks, and model outputs.
- Reuse request/job context field names.
- Reuse error normalization helpers.
- Keep audit metadata structured and minimal.

Do not create local redaction lists per feature unless the shared redaction layer cannot express the case. If a new sensitive field appears, update the shared rule.

### 9. Frontend Components And Copy

Reuse frontend patterns by responsibility:

- Layout primitives and repeated list shells can be shared.
- Feature forms stay feature-owned unless another feature truly uses the same workflow.
- Copy belongs in feature/shared copy modules.
- Error copy maps from API error codes where possible.
- Server state belongs in TanStack Query hooks, not Context.

Avoid extracting generic components that require many feature-specific props and conditionals. Prefer small shared primitives plus feature composition.

---

## When To Abstract

Abstract when:

- The same rule appears in 2+ layers or 3+ files and must stay identical.
- The code encodes a security, permission, redaction, validation, retry, or idempotency rule.
- A repeated type/schema crosses app or package boundaries.
- Two consumers need the same infrastructure integration behavior.
- Tests would otherwise need to duplicate the same setup and assertions.

Keep local when:

- The code is a one-off UI composition detail.
- The repeated code is only superficially similar but has different domain meaning.
- Extraction would require a foundation package to depend on a domain package.
- A generic helper would hide an important side effect, authorization check, or audit event.
- The abstraction would need many optional flags to serve unrelated workflows.

Prefer a narrow domain helper over a broad `utils` helper.

---

## After Batch Modifications

When changing a field, enum, error code, action name, status, or config key:

1. Search all occurrences with `rg`.
2. Check owner specs and update concrete code-specs if the contract changed.
3. Update schemas before consumers.
4. Update API, worker, frontend hooks, tests, audit/log copy, and docs as applicable.
5. Verify no duplicate stale constants remain.

Use this checklist for high-risk names:

- [ ] `tenantId`
- [ ] `knowledgeBaseId`
- [ ] `documentId`
- [ ] `requestId`
- [ ] `jobId`
- [ ] ingestion statuses and step names
- [ ] provider capability names and error codes
- [ ] audit action names
- [ ] API error codes
- [ ] list query parameter names
- [ ] Chinese domain terms in UI copy
- [ ] environment variable names

---

## Common Mistakes

### Mistake 1: The Wrong Shared Package

**Wrong**: Put knowledge-base-specific permission logic in `shared` because many packages need it.

**Correct**: Keep domain rules in `knowledge` or `security`; expose a narrow API or interface that allowed consumers can call.

### Mistake 2: Consumer-Owned Contract Types

**Wrong**: Define a frontend `ProviderConfig` type because the UI needs only a subset.

**Correct**: Import or infer the API response type, then map to a UI view model locally if needed.

### Mistake 3: Generic Utility Hides Side Effects

**Wrong**: Create `saveDocumentAndStuff()` that writes document records, enqueues ingestion, and audits.

**Correct**: Keep side effects explicit in the owning package or API orchestration so transaction, queue, and audit behavior are visible.

### Mistake 4: Copy-Pasted Security Filters

**Wrong**: Repeat tenant/knowledge-base filters manually in each retrieval query.

**Correct**: Reuse a shared authorization result or query helper that applies the same scope consistently to PostgreSQL and Meilisearch.

### Mistake 5: UI Copy Drift

**Wrong**: Inline `模型`, `AI 服务`, `供应商`, and `模型服务` across pages for the same concept.

**Correct**: Reuse centralized Chinese copy terms and API error copy mappings.

### Mistake 6: Premature Framework Extraction

**Wrong**: Build a generic ingestion framework or generic admin table system before two real implementations prove the shared shape.

**Correct**: Keep first implementations clear and local, then extract only the repeated contract and mechanics.

---

## Checklist Before Commit

- [ ] Searched with `rg` for existing names, types, schemas, hooks, constants, and copy.
- [ ] Identified the owner package/module for the repeated behavior.
- [ ] Reused or extended existing schemas/types instead of duplicating cross-layer shapes.
- [ ] Kept domain logic out of apps and generic utilities.
- [ ] Avoided creating dependency cycles or importing package internals.
- [ ] Reused shared permission, redaction, retry, idempotency, and error-mapping rules where applicable.
- [ ] Updated tests at the owner boundary and at affected consumer boundaries.
- [ ] Updated relevant specs if a reusable contract changed.
