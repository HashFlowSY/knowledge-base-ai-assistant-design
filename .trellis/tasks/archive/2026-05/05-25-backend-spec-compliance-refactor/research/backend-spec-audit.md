# Backend Spec Audit

Audit date: 2026-05-25

Scope: read-only audit of `src/apps/api`, `src/apps/worker`, and backend packages under `src/packages/*` against `.trellis/spec/backend`, `.trellis/spec/shared`, `.trellis/spec/testing`, and `.trellis/spec/guides`.

No backend implementation files were modified. No package scripts or tests were run during this audit-only pass.

## Severity

- P0: must resolve before broad refactor because it can break package/runtime boundaries.
- P1: confirmed spec violation with meaningful maintenance or runtime risk.
- P2: spec risk or hygiene issue that should be batched after higher-risk boundaries.
- Decision: violates or diverges from spec but remediation may change behavior/contract and needs explicit approval.

## Confirmed Findings

### P0-1: `@kb/api` browser-consumed root exports server runtime code

- Evidence:
  - `src/apps/api/package.json:6` exports `"."` as `./src/app.ts`.
  - `src/apps/web/src/features/api/client.ts:5` imports `type { ApiApp }` from `@kb/api` inside a client module.
  - `src/apps/api/src/app.ts:42-64` imports API default services, rate limiting, runtime services, routers, and upload concurrency.
  - `src/apps/api/src/app.ts:55` imports `createApiRuntimeServicesFromEnv`.
  - `src/apps/api/src/app.ts:182-185` exports `createDefaultApiApp`.
- Violated spec:
  - `backend/package-boundaries.md`: package roots consumed by browser/client code must export only browser-safe contracts; server-only runtime adapters must live behind explicit subpaths.
  - `backend/api-contract.md`: Hono RPC route types should be exported from a stable API entrypoint without erasing route schema.
- Risk:
  - The current API root is type-imported by web today, but the root module itself is not browser-safe and makes accidental value imports or future bundling failures likely.
- Behavior-preserving remediation:
  - Split `@kb/api` exports into a browser-safe contract entrypoint, for example `@kb/api` or `@kb/api/rpc`, that exports only `ApiApp`/schemas/types.
  - Move app/runtime factories to server-only subpaths such as `@kb/api/server` or `@kb/api/app`.
  - Update `tsconfig.base.json` paths and web imports accordingly.
  - Verify with `pnpm --filter @kb/web build`, API typecheck, and RPC contract tests.

### P0-2: `@kb/api` exported service contracts import a server-only provider service type

- Evidence:
  - `src/apps/api/src/contracts/services.ts:8` imports `ProviderConfigServiceSaveBody` from `@kb/ai-providers/service`.
  - `src/apps/api/src/app.ts:21-41` re-exports service contract types from `./contracts`.
  - `src/apps/api/src/contracts/services.ts:166-185` uses that type in `ProviderConfigApiService`.
- Violated spec:
  - `backend/package-boundaries.md`: server-only service code must not leak through a browser-consumable root entry.
  - `shared/typescript.md`: cross-layer types must be owned by the package that owns the contract and imported from the owner boundary.
- Risk:
  - API public type exports couple a browser-consumed API root to a server-only provider implementation boundary.
- Behavior-preserving remediation:
  - Move the save-body service input type to a browser-safe/provider contract module if it is truly a contract.
  - Or define an API-local service adapter type in `src/apps/api/src/contracts/services.ts` and convert to the provider service type only inside `runtime-services.ts`.

### P1-1: Infrastructure package `@kb/db` depends on domain/server auth code

- Evidence:
  - `src/packages/db/package.json:18-24` declares dependency on `@kb/auth`.
  - `src/packages/db/src/seed-dev-auth-contracts.ts:1` imports `Role` from `@kb/auth`.
  - `src/packages/db/src/seed-dev-auth-core.ts:1-2` imports `normalizeEmail` and `hashPasswordForAccount` from `@kb/auth` / `@kb/auth/server`.
- Violated spec:
  - `backend/package-boundaries.md`: infrastructure packages may depend only on foundation packages (`shared`, `config`, `observability`); `db` is infrastructure and must not depend on domain package `auth`.
- Risk:
  - The database package owns schema/migrations but now also depends on auth domain runtime helpers for dev seeding, creating an inverted dependency and making future auth/db split harder.
- Behavior-preserving remediation:
  - Move dev auth seeding orchestration to `@kb/auth`, an ops script, or an app-level bootstrap package.
  - Keep `@kb/db` focused on schema, migration, low-level client, and repository primitives.
  - If the seed must write db rows, pass password hashing/email normalization as injected functions from the auth/ops owner.

### P1-2: `@kb/knowledge` depends on `@kb/auth` for `SessionPayload`

- Evidence:
  - `src/packages/knowledge/package.json:16-21` declares dependency on `@kb/auth`.
  - `src/packages/knowledge/src/service-types.ts:1` imports `SessionPayload` from `@kb/auth`.
  - `src/packages/knowledge/src/service-queries.ts:16` imports `SessionPayload` from `@kb/auth`.
  - `src/packages/knowledge/src/operations/create-knowledge-base.ts:35`, `update-knowledge-base.ts:36`, and `upload-document-file.ts:299` use actor role semantics.
- Violated spec:
  - `backend/package-boundaries.md`: adjacent domain dependencies are explicit; `knowledge` is not listed as allowed to depend on `auth`.
  - `shared/typescript.md`: cross-layer identity types should be owned by the correct contract boundary and not duplicated or coupled unnecessarily.
- Risk:
  - Knowledge-domain services are coupled to an auth package session payload rather than a narrow domain actor contract.
- Behavior-preserving remediation:
  - Define a `KnowledgeActor`/`TenantActor` input type owned by `@kb/knowledge` or `@kb/shared`.
  - Map `SessionPayload` to that actor shape in `src/apps/api` before calling knowledge services.
  - Remove `@kb/auth` from `@kb/knowledge` after consumers are updated.

### P1-3: Audit persistence is scattered instead of owned by `@kb/audit`

- Evidence:
  - `src/packages/audit/src/index.ts:18-27` defines only a minimal event schema.
  - `src/apps/api/src/runtime-services.ts:88-99`, `106-120`, and `123-138` insert `auditLogs` directly.
  - `src/packages/users/src/service-audit.ts:1` imports `auditLogs` from `@kb/db` and inserts directly at `service-audit.ts:26-37`.
  - `src/packages/knowledge/src/operations/upload-document-file.ts:711-725` inserts `auditLogs` directly.
  - `src/apps/api/package.json:19` depends on `@kb/audit`, but static search found no production imports of `@kb/audit`.
- Violated spec:
  - `backend/audit.md`: `src/packages/audit` owns audit event types, persistence helpers, and redaction rules.
  - `backend/package-boundaries.md`: cross-domain side effects should be explicit; audit package accepts generic actor/action/target metadata.
- Risk:
  - Audit field defaults, redaction, action validation, and context handling can diverge between API/users/knowledge/provider flows.
- Behavior-preserving remediation:
  - Add an `@kb/audit` service/repository boundary that accepts generic audit inputs and persists to `@kb/db`.
  - Keep domain packages calling audit through a narrow interface when practical.
  - Migrate direct insert helpers to the audit package without changing event names or metadata payloads.

### P1-4: Provider config audit events lose request IP/user-agent context

- Evidence:
  - `src/packages/ai-providers/src/service.ts:130-142` defines `ProviderAuditEventInput` with `tenantId`, `actorId`, `action`, `targetId`, `requestId`, and `metadata`, but no `ipSummary` or `userAgentSummary`.
  - `src/apps/api/src/runtime-services.ts:88-99` persists provider audit events without `ipSummary` or `userAgentSummary`.
  - `src/apps/api/src/modules/providers/procedures/save-provider.ts:71-83` passes `actor`, `body`, `kind`, and `requestId` but not request IP/user-agent.
- Violated spec:
  - `backend/audit.md`: audit records must include `ipHash` or `ipSummary` and `userAgentSummary` when available.
  - `backend/security.md`: provider config mutations are security-sensitive and must be audited.
- Risk:
  - Admin provider config changes are persisted without available request source context.
- Behavior-preserving remediation:
  - Add a request-context input to the API provider service adapter or audit recorder.
  - Persist `ipSummary` and `userAgentSummary` for provider config create/update/disable/status-check events.

### P1-5: Runtime log calls are wired to a no-op sink by default

- Evidence:
  - `src/packages/observability/src/index.ts:57-62` makes `createLogger()` default to an intentionally empty sink.
  - `src/apps/api/src/app.ts:76` creates the API logger without a sink and logs requests at `app.ts:120-125`.
  - `src/apps/worker/src/lifecycle.ts:33` creates the worker logger without a sink and logs lifecycle events at `lifecycle.ts:43-45`, `74-77`, and `89-91`.
  - `src/apps/api/src/modules/documents/procedures/upload-document-file.ts:31` creates `uploadLogger` without a sink.
- Violated spec:
  - `backend/logging.md`: API middleware should log request completion/failures; workers should log lifecycle transitions.
  - `backend/observability.md`: apps and packages import observability helpers and emit usable logs/traces/metrics.
- Risk:
  - Code calls structured logging APIs, but production/runtime logs are dropped unless every caller injects a sink manually.
- Behavior-preserving remediation:
  - Add a structured console/collector sink in `@kb/observability` and wire it from runtime entrypoints.
  - Prefer request-scoped child loggers in Hono context so downstream helpers use the same requestId/method/path.

### P1-6: API request middleware does not guarantee failure logging/error mapping

- Evidence:
  - `src/apps/api/src/app.ts:108-126` logs after `await next()`, but does not wrap with `try`/`catch`/`finally`.
  - Static search found no `app.onError` registration in `src/apps/api/src`.
- Violated spec:
  - `backend/api-contract.md`: error mapper is part of the middleware order.
  - `backend/logging.md`: global API error handler should log unhandled errors and include `requestId` in client-visible errors.
- Risk:
  - Thrown handler/middleware errors may bypass standard `ApiErrorResponse` mapping and request-failure logging.
- Behavior-preserving remediation:
  - Add a global Hono error handler or wrap request middleware with `try/finally` plus standard error response mapping.
  - Add API tests for thrown route errors preserving the error envelope and requestId.

### P1-7: Upload CSRF/content-type failures do not consume the route rate limit

- Evidence:
  - `src/apps/api/src/modules/documents/procedures/upload-document-file.ts:37-43` returns mutation/CSRF failures directly.
  - `upload-document-file.ts:45-54` returns unsupported media type directly.
  - `upload-document-file.ts:79-87` consumes the document upload rate limit only after session resolution.
- Violated spec:
  - `backend/api-contract.md`: covered routes that reject before route-level rate limiting, such as CSRF/content-type failures, must still count the attempt with the route's unauthenticated identity.
  - `backend/security.md` / `backend/storage.md`: upload routes have explicit rate-limit requirements.
- Risk:
  - Malformed upload probing can avoid the upload route limiter before authentication.
- Behavior-preserving remediation:
  - Add an unresolved upload rate-limit helper using IP identity.
  - For upload routes, consume exactly one limiter key whether rejection happens before or after actor resolution.
  - Preserve existing error codes/statuses.

### P1-8: Upload operation swallows several backend failures without structured logs

- Evidence:
  - `src/packages/knowledge/src/operations/upload-document-file.ts:93-97` catches all unexpected operation errors and returns `INTERNAL_ERROR` with no log.
  - `upload-document-file.ts:176-203` catches object upload failure, persists failure state, but logs no structured failure.
  - `upload-document-file.ts:260-284` catches queue enqueue failure and persists retry state, but logs no structured failure.
  - `upload-document-file.ts:680-693` catches object cleanup failure and returns `{ ok: false }`; audit is written later, but no structured log is emitted.
- Violated spec:
  - `shared/code-quality.md`: do not swallow errors silently.
  - `backend/logging.md`: always log database write failures, ingestion lifecycle failures, queue retry exhaustion, and external storage failures with context.
- Risk:
  - Operators may see generic API errors or persisted failure state without a correlated structured log.
- Behavior-preserving remediation:
  - Add logger injection or observability helper usage to knowledge upload operation.
  - Log normalized error messages with `requestId`, `tenantId`, `actorId`, `knowledgeBaseId`, `documentId`, and `jobId` where available.

### P1-9: API server port bypasses config validation

- Evidence:
  - `src/apps/api/src/server.ts:16` reads `process.env.PORT` directly and parses it manually.
  - `src/packages/config/src/index.ts:20-121` validates runtime config but has no `PORT` field.
  - `src/apps/api/.env.example:1` documents `PORT=4000`.
- Violated spec:
  - `shared/config.md`: `src/packages/config` owns config schemas, parsing, defaults, and redaction; apps call config loaders at startup.
- Risk:
  - API listen port is configured outside the validated runtime config contract.
- Behavior-preserving remediation:
  - Add `PORT` or an API-specific server config loader in `@kb/config`.
  - Replace direct `process.env.PORT` access in the server entrypoint with validated config.

### P2-1: Queue connection parsing is duplicated outside the queue package

- Evidence:
  - `src/packages/queue/src/producer.ts:42-65` defines a private `createBullMqConnectionOptions`.
  - `src/apps/worker/src/index.ts:77` creates connection options locally for `Worker` / `QueueEvents`.
  - `src/apps/worker/src/index.ts:141-164` duplicates Redis URL parsing and BullMQ connection option shaping.
- Violated spec:
  - `backend/worker-queue.md`: `src/packages/queue` owns queue names, job schemas, producer helpers, and shared queue configuration.
  - `guides/code-reuse-thinking-guide.md`: repeated queue payload/config rules belong to `src/packages/queue`.
- Risk:
  - Producer and worker connection handling can drift.
- Behavior-preserving remediation:
  - Export a `createBullMqConnectionOptions` helper from `@kb/queue` or add a worker/queue factory in `@kb/queue`.
  - Update producer and worker to share it.

### P2-2: Public backend functions lack explicit return types in important APIs

- Evidence:
  - `src/apps/api/src/app.ts:74` exports `createApiApp` without an explicit return type.
  - `src/packages/auth/src/server-runtime.ts:17` exports `createBetterAuthRuntime` without an explicit return type and then derives `BetterAuthRuntime` from it at `server-runtime.ts:40`.
  - `src/packages/users/src/auth-mutation-repository.ts:5` exports `createAuthMutationRepository` without an explicit return type.
- Violated spec:
  - `shared/typescript.md`: exported functions in shared/backend packages should declare return types when inference would hide an important contract.
- Risk:
  - Public contracts drift silently when implementation details change.
- Behavior-preserving remediation:
  - Add explicit return types or exported interfaces for public factory functions.
  - Start with high-fanout APIs: `createApiApp`, auth runtime, and mutation repositories.

### P2-3: API service error code type is too broad for the public error contract

- Evidence:
  - `src/apps/api/src/contracts/services.ts:30-36` defines `ApiServiceError.code` as `string`.
  - `src/apps/api/src/http.ts:21-37` and `request-helpers.ts:16-24` pass service error codes directly into `ApiErrorResponse`.
- Violated spec:
  - `backend/api-contract.md`: API errors returned to clients must use standard public codes.
  - `shared/typescript.md`: boundary types should be precise and schema-owned.
- Risk:
  - A package service can accidentally return a non-standard public API code without TypeScript catching it.
- Behavior-preserving remediation:
  - Add a shared `apiErrorCodeSchema` / `ApiErrorCode` union for the public codes.
  - Narrow `ApiServiceError.code` to that union and update service mappings.

### P1-10: API module `types.ts` files do not own endpoint schemas/types as specified

- Evidence:
  - `src/apps/api/src/modules/auth/types.ts:1-7` contains only route dependency interfaces.
  - `src/apps/api/src/modules/users/types.ts:1-14` contains only route dependency interfaces.
  - `src/apps/api/src/modules/knowledge-bases/types.ts:1-14` contains only route dependency interfaces.
  - `src/apps/api/src/modules/documents/types.ts:1-18` contains only route dependency interfaces.
  - `src/apps/api/src/modules/providers/types.ts:1-16` contains only route dependency interfaces.
  - Endpoint schemas are imported directly in procedures instead, for example `src/apps/api/src/modules/users/procedures/create-user.ts:3` imports `createUserInputSchema` from `@kb/users`, and `src/apps/api/src/modules/providers/procedures/save-provider.ts:3-6` imports provider schemas from `@kb/ai-providers`.
- Violated spec:
  - `backend/api-module.md`: module `types.ts` defines Zod schemas for endpoint inputs/outputs, exports inferred API types, owns list filter, pagination, and path/query/body input schemas, and does not contain business logic.
  - `backend/api-contract.md`: schemas should live in the domain API module or a shared contract package when used by multiple apps/packages.
- Risk:
  - The file named `types.ts` is being used as a dependency container, while API endpoint contracts are scattered across procedures and domain package imports. This makes it harder to review an API module's HTTP contract from one place.
- Behavior-preserving remediation:
  - Move route dependency interfaces to `dependencies.ts` or keep them local to `router.ts`.
  - Make each module `types.ts` explicitly re-export or wrap the API boundary schemas/types it owns.
  - Where schemas are intentionally package-owned for cross-layer reuse, document that in the module `types.ts` and re-export the API-facing contract from there.

### P1-11: Auth API-local service code lives outside the auth module tree

- Evidence:
  - `src/apps/api/src/modules/auth/` contains `types.ts`, `router.ts`, and `procedures/*`.
  - API-local auth service implementation lives under `src/apps/api/src/services/auth/better-auth-service.ts`, `cookies.ts`, and `errors.ts`.
  - `src/apps/api/src/auth-service.ts:1-5` is a root-level barrel for that service.
- Violated spec:
  - `backend/api-module.md`: organize API modules by business domain and keep reusable/API-local helpers, mappers, and validators in module-local `lib/` where appropriate.
  - `backend/package-boundaries.md`: apps own framework concerns, while reusable domain logic belongs in packages.
- Risk:
  - Auth HTTP module and auth runtime adapter are split across two domain locations (`modules/auth` and `services/auth`), making ownership and file placement inconsistent with the module shape.
- Behavior-preserving remediation:
  - Move API-local auth service helpers under `src/apps/api/src/modules/auth/lib/` or an explicit server-runtime adapter subpath if shared by runtime wiring.
  - Keep `modules/auth/router.ts` and procedures as the visible HTTP adapter.

### P2-4: `user-routes.ts` is a root-level domain route wrapper outside the users module

- Evidence:
  - `src/apps/api/src/user-routes.ts:1-12` imports `createUsersRouter` and exposes `registerUserRoutes`.
  - `src/apps/api/src/modules/users/router.ts:11-33` already creates and mounts all user routes.
  - `src/apps/api/src/app.ts:63` imports the root-level wrapper instead of routing the users module directly like other modules.
- Violated spec:
  - `backend/api-module.md`: organize API modules by business domain and use `app.route()` to group related routes.
- Risk:
  - Users is the only domain with an extra root-level route wrapper, which creates an inconsistent module registration pattern.
- Behavior-preserving remediation:
  - Remove the root wrapper and route `createUsersRouter(...)` from `app.ts` the same way knowledge-bases/documents/providers are mounted.

### P2-5: Document upload procedure is too large and still contains module-local helper responsibilities

- Evidence:
  - `src/apps/api/src/modules/documents/procedures/upload-document-file.ts` is 336 lines.
  - It defines `ContentLengthResult` at `upload-document-file.ts:21-29`.
  - It contains content-length parsing at `upload-document-file.ts:225-261`, multipart parsing at `upload-document-file.ts:263-296`, checksum creation at `upload-document-file.ts:298-307`, and security-audit helper logic at `upload-document-file.ts:309-336`.
  - The module already has `src/apps/api/src/modules/documents/lib/file-validation.ts`, so there is an established module-local `lib/` location for upload validators/helpers.
- Violated spec:
  - `backend/api-module.md`: procedures should stay focused on endpoint handler steps; large procedures should move reusable/API-local helpers to module `lib/` or domain logic to packages.
- Risk:
  - Upload handler mixes route orchestration with low-level request parsing helpers, making future changes to upload validation/rate-limit/audit flows harder to review.
- Behavior-preserving remediation:
  - Move content-length parsing, multipart parsing, checksum creation, and security-audit helper into `modules/documents/lib/` files.
  - Keep `uploadDocumentFileProcedure` as the thin HTTP flow: guard, auth, rate-limit, parse/validate via lib, call service, map response.

### P1-12: `src/apps/api/src` top-level has too many functional implementation files

- Evidence:
  - Static count found 18 direct files under `src/apps/api/src`.
  - Several top-level files are not package entrypoints or barrels:
    - `src/apps/api/src/rate-limit.ts` is 250 lines.
    - `src/apps/api/src/session-guards.ts` is 402 lines.
    - `src/apps/api/src/default-services.ts` is 216 lines.
    - `src/apps/api/src/runtime-services.ts` is 208 lines.
    - `src/apps/api/src/request-helpers.ts` is 90 lines.
    - `src/apps/api/src/upload-concurrency.ts` is 59 lines.
  - These files mix distinct functional areas at the API source root: rate-limit storage/identity, auth/session guard orchestration, runtime dependency wiring, default test/bootstrap services, HTTP helpers, and upload concurrency.
- Violated spec:
  - `backend/api-module.md`: organize API modules by business domain; reusable API-local helpers, mappers, and validators should be placed with the module owner or in an explicit helper boundary.
  - `guides/code-reuse-thinking-guide.md`: repeated/cross-cutting contracts should have a clear owner rather than living as unrelated root-level utilities.
- Risk:
  - The API root is becoming a catch-all implementation directory. This makes ownership unclear and makes later refactors more likely to create circular imports or hidden cross-domain dependencies.
- Behavior-preserving remediation:
  - Keep `src/apps/api/src` root limited to package/server entrypoints and intentional barrels, for example `app.ts`, `server.ts`, and contract exports.
  - Move cross-cutting implementation into function-oriented folders. Suggested target layout:

```text
src/apps/api/src/
├── app.ts
├── server.ts
├── contracts/
├── http/
│   ├── responses.ts
│   └── request-body.ts
├── guards/
│   ├── mutation.ts
│   └── session.ts
├── rate-limit/
│   ├── identities.ts
│   ├── limiter.ts
│   └── stores.ts
├── runtime/
│   ├── services.ts
│   └── defaults.ts
└── modules/
    └── [domain]/
        ├── types.ts
        ├── router.ts
        ├── procedures/
        └── lib/
```

  - Place upload-specific concurrency and upload parsing helpers under `modules/documents/lib/` unless they become shared across domains.
  - Move root-level tests with the owned area when practical, or keep higher-level app integration tests at the root if they genuinely exercise the assembled API app.

## Decision / Behavior-Risk Findings

### Decision-1: Pending duplicate upload path conflicts with upload duplicate contract

- Evidence:
  - `src/packages/knowledge/src/operations/upload-document-file.ts:479-498` treats `pending_upload` and `available` sources as active duplicates.
  - `src/packages/knowledge/src/operations/upload-document-file.ts:556-595` maps duplicates with `row.jobQueuedAt.toISOString()` at line `574`.
  - `src/packages/knowledge/src/schemas.ts:173-185` requires `job.queuedAt` to be a non-null ISO timestamp.
  - Reservation creates `ingestionJobs.status = "pending_source"` at `upload-document-file.ts:390-408`; `queuedAt` is only set during finalization at `upload-document-file.ts:442-449`.
- Violated spec:
  - `backend/storage.md`: active duplicate checksum should return the existing document/job and not create DB rows or objects.
  - `backend/timestamps.md`: API timestamps should be serialized intentionally; nullable persisted timestamps should not be treated as non-null at the boundary.
- Risk:
  - A concurrent duplicate upload that lands after reservation but before finalization can hit a null `queuedAt` path and fall into a generic internal error.
- Why this needs a decision:
  - Correct remediation may require changing `DocumentFileUploadResult.job.queuedAt` to nullable or changing duplicate handling for `pending_source`, which is an API contract/behavior decision.
- Suggested handling:
  - Do not fold this into a purely structural refactor without explicit approval.
  - Create a targeted bugfix task or approve a contract-preserving fallback if the current public contract must remain unchanged.

### Decision-2: Meilisearch `chunkId` currently uses `contentHash`, not the persisted chunk UUID

- Evidence:
  - `src/packages/ingestion/src/index.ts:427-438` persists chunks/embeddings but does not receive persisted chunk IDs.
  - `src/packages/ingestion/src/index.ts:441-454` indexes search documents with `chunkId: chunk.contentHash` at line `444`.
  - `src/packages/search/src/index.ts:14-25` models `chunkId` as a search document field.
- Violated spec:
  - `backend/rag-ingestion.md`: search documents and retrieval candidates preserve `chunkId`, `documentId`, `knowledgeBaseId`, and citation metadata; citations should link to chunk identity.
- Risk:
  - Search results may not be able to map directly to persisted `document_chunks.id` for future RAG citations.
- Why this needs a decision:
  - Fixing this likely changes indexed document content and may require reindex/reingestion or a migration-style compatibility plan.
- Suggested handling:
  - Defer from the first behavior-preserving refactor batch.
  - Plan as a separate ingestion/search contract correction if RAG citation work depends on it.

### Decision-3: Worker rejects URL ingestion payloads even though queue/schema/spec mention URL ingestion

- Evidence:
  - `src/packages/queue/src/schemas.ts` defines a `url_ingestion` payload.
  - `src/apps/worker/src/index.ts:80-84` throws `"URL ingestion is out of scope for this worker."`.
- Violated spec:
  - `backend/rag-ingestion.md`: initial source connectors include file upload and web URL.
  - `backend/worker-queue.md`: worker processors should map job payloads to package calls.
- Risk:
  - The queue contract can accept URL ingestion jobs that the worker immediately fails.
- Why this needs a decision:
  - Supporting URL ingestion would be new functionality relative to current worker behavior and is outside the user's "no add/remove functionality" constraint.
- Suggested handling:
  - Keep out of this refactor task.
  - Track separately if URL ingestion is in the product scope.

## Phased Refactor Plan

### Phase 0: Lock audit scope and regression baselines

- Goal: keep this task read-only until user approves implementation.
- Actions:
  - Review this audit report with the user.
  - Decide whether Decision findings are separate bug/feature tasks.
  - Before any code changes later, re-run Trellis Phase 2 entry and `trellis-before-dev`.
- Verification:
  - No backend implementation files changed.

### Phase 1: Package/export boundary cleanup

- Target findings: P0-1, P0-2, P1-1, P1-2.
- Order:
  1. Split `@kb/api` contract exports from server runtime exports.
  2. Move provider save-body service type out of the browser-consumed API surface.
  3. Remove `@kb/db -> @kb/auth` by moving dev auth seeding orchestration.
  4. Replace `@kb/knowledge -> @kb/auth` `SessionPayload` inputs with a narrow actor contract.
- Expected tests/checks:
  - `pnpm --filter @kb/api typecheck`
  - `pnpm --filter @kb/web build`
  - `pnpm --filter @kb/db typecheck`
  - `pnpm --filter @kb/knowledge test`
  - Root `pnpm typecheck`
- Rollback:
  - Each subpath/export split can be reverted independently if imports fail.

### Phase 2: API module shape cleanup

- Target findings: P1-10, P1-11, P1-12, P2-4, P2-5.
- Order:
  1. Normalize `modules/*/types.ts` responsibilities: endpoint schemas/types live or are re-exported there; route dependencies move out.
  2. Introduce function-oriented folders for API root helpers: `http/`, `guards/`, `rate-limit/`, and `runtime/`.
  3. Move API-local auth service files under the auth module boundary or a clearly named server adapter boundary.
  4. Remove `user-routes.ts` and mount users through the module router directly.
  5. Split document upload request parsing/checksum/audit helpers into `modules/documents/lib/`.
- Expected tests/checks:
  - `pnpm --filter @kb/api test`
  - `pnpm --filter @kb/api typecheck`
  - Targeted upload API tests after splitting upload helpers.
- Rollback:
  - File moves should be behavior-preserving and can be reverted module by module.

### Phase 3: Audit and observability ownership

- Target findings: P1-3, P1-4, P1-5, P1-6, P1-8.
- Order:
  1. Add a real runtime logger sink and request-scoped logger context.
  2. Add global API error mapping/logging.
  3. Move audit persistence helpers into `@kb/audit`.
  4. Thread request context into provider audit events.
  5. Add structured logs around upload object/queue/finalization failure paths.
- Expected tests/checks:
  - API tests for thrown error envelope + `requestId`.
  - Audit package tests for redaction/required context mapping.
  - Upload tests for failure logging using injected sink/fake logger.
  - `pnpm --filter @kb/api test`
  - `pnpm --filter @kb/audit test`
- Rollback:
  - Keep old direct audit inserts until the audit helper is covered by tests; migrate one caller at a time.

### Phase 4: API guard/rate-limit and config contract cleanup

- Target findings: P1-7, P1-9, P2-3.
- Order:
  1. Add unresolved upload rate-limit path for pre-auth CSRF/content-type failures.
  2. Add validated API server port config.
  3. Narrow public API error code typing.
- Expected tests/checks:
  - API upload tests for malformed content-type/CSRF consuming one limiter key.
  - Config tests for `PORT` default/override.
  - Typecheck to catch non-standard API codes.
- Rollback:
  - Rate-limit changes should be isolated in `session-guards` and upload procedure tests.

### Phase 5: Shared queue/config helper cleanup and TypeScript contract hygiene

- Target findings: P2-1, P2-2.
- Order:
  1. Move BullMQ connection option helper into `@kb/queue`.
  2. Update worker and producer to share it.
  3. Add explicit return types to exported public factories.
- Expected tests/checks:
  - `pnpm --filter @kb/queue test`
  - `pnpm --filter @kb/worker typecheck`
  - Root `pnpm lint` and `pnpm typecheck`

### Deferred / Separate Tasks

- Pending duplicate upload contract correction (Decision-1).
- Search `chunkId` persisted identity correction/reindex plan (Decision-2).
- URL ingestion worker support (Decision-3).

These are intentionally separated because they can affect runtime behavior or public contracts, while the user's current constraint is a behavior-preserving backend refactor.
