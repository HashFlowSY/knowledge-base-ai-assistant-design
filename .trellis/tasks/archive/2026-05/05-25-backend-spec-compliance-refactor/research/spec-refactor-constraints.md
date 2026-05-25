# Spec Refactor Constraints

## Scope Read

- Backend scope: `src/apps/api`, `src/apps/worker`, and backend-focused packages under `src/packages/*`.
- Shared scope: strict TypeScript, Zod-first boundaries, config ownership, and shared API envelope types.
- Testing scope: Vitest unit tests by default, integration and E2E only when changed code crosses infrastructure/runtime boundaries.
- Thinking guides used: code reuse and cross-layer flow checks.

## Hard Constraints

- Do not add, remove, or intentionally change product behavior.
- Refactor must preserve current API paths, response envelopes, status codes, public error codes, queue payload contracts, package public contracts, and frontend-visible Hono RPC types unless a spec violation makes a contract split necessary.
- API handlers own HTTP concerns only: parsing, validation, auth context, authorization, error mapping, logging, and package orchestration.
- Domain behavior belongs in `src/packages/*`; apps must not accumulate core business logic.
- Public package roots consumed by browser/client code must export only browser-safe contracts. Server-only service code belongs behind explicit subpaths such as `@kb/users/service`.
- Every external boundary uses Zod schemas or inferred types from the owner package; consumers must not redefine cross-layer types.
- No new `any`, non-null assertions, `@ts-ignore`, `@ts-expect-error`, production `console.log`, or swallowed errors.
- Config parsing belongs in `@kb/config` loaders. Packages receive typed config or narrow values and should not parse `process.env` directly.
- Logs, audit metadata, API responses, traces, and config dumps must not expose secrets, prompts, full chunks, full model outputs, signed URL query strings, database URLs, or object storage credentials.
- Tenant, actor, knowledge-base, request, job, document, and document-version identifiers must be passed explicitly across boundaries where authorization, audit, retry, or correlation depends on them.
- Queue workers and ingestion steps must stay idempotent/retry-safe.
- Database transactions must not cover external object storage or provider I/O.
- API timestamps remain camelCase ISO 8601 strings at the API boundary; persisted timestamps use timezone-aware database fields.

## Current Backend Shape Observed

- Workspace uses pnpm and Turbo scripts: `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test`, `pnpm test:integration`, and `pnpm test:e2e`.
- Backend applications:
  - `src/apps/api` exposes Hono app/server, API modules, RPC contract, request helpers, runtime service wiring, rate limiting, auth/session guards, and tests.
  - `src/apps/worker` owns worker lifecycle and ingestion worker startup.
- Backend packages include `auth`, `users`, `knowledge`, `ingestion`, `rag`, `ai-providers`, `search`, `storage`, `queue`, `audit`, `security`, `observability`, `config`, `shared`, and `db`.
- Several domain packages already expose browser-safe roots plus server-only subpaths, for example `@kb/users` + `@kb/users/service`, `@kb/knowledge` + `@kb/knowledge/service`, `@kb/ai-providers` + `@kb/ai-providers/service`, and `@kb/auth` + `@kb/auth/server`.
- `src/apps/web` imports browser-safe roots such as `@kb/users`, `@kb/knowledge`, `@kb/ai-providers`, `@kb/auth`, and also imports `type { ApiApp }` from `@kb/api`.

## Initial Risk Areas To Audit During Implementation

- `@kb/api` root export currently points at `src/apps/api/src/app.ts`, which mixes browser-consumed type exports with server app creation/runtime imports. If refactored, preserve the frontend Hono RPC type contract while avoiding browser-unsafe root exports where practical.
- `src/apps/api/src/contracts/services.ts` imports a type from `@kb/ai-providers/service`; verify this does not pull server-only contracts into a browser-consumed API root path.
- `src/apps/api/src/server.ts` reads `process.env.PORT` directly; verify whether app entrypoints may read process env or whether `PORT` must move behind `@kb/config`.
- API modules rely on repeated relative imports into request helpers/session guards. This may be acceptable, but the refactor should check whether directory/package boundaries can be clarified without hiding required auth, validation, and error-mapping steps.
- Static scan found `process.env` in runtime entrypoints and database migration/seed files. Treat these as candidates for review against config ownership rather than automatic violations.
- Current code already has many tests around API envelopes, rate limits, provider config, upload validation, queue, package contracts, and service behavior. Prefer extending those tests only when file splits or contract moves increase regression risk.

## Verification Expectations

- At minimum for implementation: `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build`.
- Add targeted package/API tests only when moving logic across files or package boundaries.
- Run `pnpm --filter @kb/web build` if public package exports or API RPC contract imports used by the web app change.
- Run database/migration verification only if a refactor unexpectedly touches `src/packages/db/drizzle*` or schema files; by default this task should avoid schema and migration changes.
