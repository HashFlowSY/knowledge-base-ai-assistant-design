# Backend Spec Compliance Refactor

## Goal

Audit the current backend code against the Trellis spec, then produce a concrete spec-violation/risk list and phased refactor plan. This phase is explicitly read-only for backend code: it must not change product code or product behavior.

## What I Already Know

- User requested a task to refactor the current backend code because earlier development did not strictly follow the spec directory rules for package dependencies, directories, and code style.
- User explicitly forbids feature additions/removals.
- User allows adding tests as needed after file splitting.
- User explicitly requires understanding the spec constraints before development and forbids starting implementation independently.
- User selected the audit-first path: do not modify backend code yet; first output spec violations and a phased plan.
- User clarified that `src/apps/api/src` has too many top-level single files such as `rate-limit.ts`; the desired structure is function-oriented folders, and adding folders is acceptable.
- Current task status is `planning`; implementation has not started.
- Relevant specs and guides were read:
  - `.trellis/spec/backend/index.md`
  - `.trellis/spec/backend/package-boundaries.md`
  - `.trellis/spec/backend/api-module.md`
  - `.trellis/spec/backend/api-contract.md`
  - `.trellis/spec/backend/database.md`
  - `.trellis/spec/backend/logging.md`
  - `.trellis/spec/backend/observability.md`
  - `.trellis/spec/backend/audit.md`
  - `.trellis/spec/backend/performance.md`
  - `.trellis/spec/backend/security.md`
  - `.trellis/spec/backend/storage.md`
  - `.trellis/spec/backend/worker-queue.md`
  - `.trellis/spec/backend/rag-ingestion.md`
  - `.trellis/spec/backend/ai-provider.md`
  - `.trellis/spec/backend/timestamps.md`
  - `.trellis/spec/shared/index.md`
  - `.trellis/spec/shared/code-quality.md`
  - `.trellis/spec/shared/typescript.md`
  - `.trellis/spec/shared/config.md`
  - `.trellis/spec/testing/index.md`
  - `.trellis/spec/testing/strategy.md`
  - `.trellis/spec/guides/code-reuse-thinking-guide.md`
  - `.trellis/spec/guides/cross-layer-thinking-guide.md`
- Persisted spec summary: `research/spec-refactor-constraints.md`.
- Persisted audit report: `research/backend-spec-audit.md`.

## Assumptions

- This refactor should prioritize backend architecture/spec compliance over cosmetic renames.
- Database schema and migrations are out of scope unless a required package-boundary refactor cannot be done safely without a schema-adjacent test or type adjustment.
- Frontend code is out of scope except for import updates or build verification needed to preserve existing backend API/RPC contracts.
- External dependency upgrades are out of scope unless strictly required to preserve existing behavior after a package boundary split.

## Requirements

- Do not modify backend implementation code in this phase.
- Audit existing behavior, structure, package dependencies, contracts, config ownership, code quality, and tests against the loaded specs.
- Produce a prioritized list of spec violations and spec-risk items with file references, severity, violated spec, and recommended remediation.
- Produce a phased implementation plan that can later be executed without adding/removing functionality.
- Preserve existing behavior and user-visible contracts in the future implementation plan.
- Do not add new API routes, new product workflows, new background job types, new database schema concepts, or new provider capabilities.
- Do not remove existing API routes, package exports, queue contracts, tests, or workflows unless they are replaced with behavior-equivalent structure and all current consumers are updated.
- Align backend code with package dependency direction:
  - apps may orchestrate package calls;
  - domain packages own business rules;
  - infrastructure packages own infrastructure integrations;
  - foundation packages must not depend on domain/infrastructure packages.
- Keep browser-safe package roots separate from server-only service/runtime code where packages are consumed by `src/apps/web`.
- Keep API modules grouped by business domain with `types.ts`, `router.ts`, `procedures/`, and local `lib/` only where useful.
- Keep `src/apps/api/src` top-level small and intentional. Prefer top-level entrypoints/barrels only; move cross-cutting or feature-specific implementation files into function-oriented folders.
- Keep API handlers thin: parse, validate, authenticate, authorize, rate-limit, map errors, log, and call package services.
- Keep shared schemas/types owned by their contract owner; avoid duplicated cross-layer shapes.
- Preserve the standard API success/error envelopes from `@kb/shared`.
- Preserve Hono RPC route type safety.
- Preserve existing rate-limit semantics, audit semantics, upload validation semantics, provider secret handling, queue idempotency, and ingestion retry semantics.
- Do not introduce new `any`, non-null assertions, TypeScript suppression comments, production console logging, direct secret logging, or swallowed errors.
- Prefer file moves/splits and import rewiring over broad rewrites.
- Add or adjust tests when moving logic changes module seams, package exports, or contract ownership.

## Acceptance Criteria

- [ ] A backend spec audit artifact exists under `research/`.
- [ ] Audit findings include file references and distinguish confirmed violations from lower-confidence risks.
- [ ] Each finding maps to at least one spec file or spec rule.
- [ ] Each finding has a recommended remediation that preserves behavior.
- [ ] A phased refactor plan exists with suggested order, blast radius, tests/checks, and rollback considerations.
- [ ] API refactor plan includes a target folder layout for `src/apps/api/src`, including where rate limiting, session/auth guards, runtime wiring, HTTP helpers, and upload-specific helpers should live.
- [ ] No backend implementation files are modified during this audit-only phase.
- [ ] If commands are run, their purpose and result are recorded; missing or blocked verification is documented precisely.

## Definition Of Done

- PRD confirmed by the user before implementation starts.
- Audit artifact and phased plan are reviewed with the user before `task.py start` or backend code changes.
- Relevant spec files are re-read immediately before any later code changes via the Trellis development flow.
- Any future implementation stays behavior-preserving.

## Out Of Scope

- New product features.
- New API routes or UI workflows.
- New database schema capabilities or migrations by default.
- Provider capability expansion.
- RAG algorithm changes.
- Ingestion pipeline behavior changes.
- Dependency upgrades or package manager changes unless needed to keep current behavior compiling after structural refactor.

## Technical Notes

- Repo is a pnpm workspace with packages under `src/apps/*` and `src/packages/*`.
- Root scripts are available for `build`, `typecheck`, `lint`, `test`, `test:integration`, and `test:e2e`.
- Initial source scan identified backend code across:
  - `src/apps/api`
  - `src/apps/worker`
  - `src/packages/*`
- Candidate audit areas are recorded in `research/spec-refactor-constraints.md`.
- Confirmed audit findings and the phased plan are recorded in `research/backend-spec-audit.md`.

## Implementation Progress

- 2026-05-25: User approved starting implementation after the audit/plan.
- 2026-05-25: Started with Phase 2 API module shape cleanup because the user specifically highlighted `src/apps/api/src` top-level file sprawl and allowed adding function-oriented folders.
- 2026-05-25: First implementation batch addressed P1-10, P1-11, P1-12, P2-4, and P2-5 without adding/removing product functionality.
- 2026-05-25 verification:
  - `pnpm --filter @kb/api typecheck` passed.
  - `pnpm --filter @kb/api test` passed: 6 test files, 56 tests.
  - `pnpm --filter @kb/api lint` passed.
  - `pnpm typecheck` passed: 18 packages.
  - `git diff --check` passed.
- 2026-05-25: Completed the remaining behavior-preserving backend spec refactor batches:
  - Package/export boundaries: `@kb/api` browser-safe root export, API-local provider save body, dev auth seed ownership moved out of `@kb/db`, and `@kb/knowledge` no longer depends on `@kb/auth`.
  - Audit/observability: audit persistence is owned by `@kb/audit`, provider audit events receive request IP/user-agent summaries, runtime loggers have a JSON console sink, API has global error mapping/logging, and upload backend failures log structured context.
  - API/config/queue/type hygiene: pre-auth upload failures consume the document-upload limiter with an unresolved IP identity, `PORT` is validated by `@kb/config`, public API error codes are schema-owned by `@kb/shared`, BullMQ connection parsing is shared from `@kb/queue`, and high-fanout factories have explicit return types.
- 2026-05-25 final verification:
  - `pnpm typecheck` passed: 18 packages.
  - `pnpm lint` passed: 18 packages.
  - `pnpm test` passed: 33 Turbo tasks; API 8 test files / 62 tests; web 27 test files / 102 tests.
  - `pnpm --filter @kb/web build` passed.
  - `pnpm build` passed: 18 packages.
  - `git diff --check` passed.
  - Turbo emitted existing `outputs` warnings for several build/test tasks; no command failed.
- 2026-05-25: Updated Trellis specs for the new executable contracts:
  - `backend/api-contract.md`: public API error codes are owned by `@kb/shared` `ApiErrorCode`.
  - `backend/worker-queue.md`: BullMQ Redis connection options are shared from `@kb/queue`.
  - `shared/config.md`: API server `PORT` is validated by runtime config.
- 2026-05-25: Classified API test files out of `src/apps/api/src` root and into their owning directories:
  - Split the former mixed `app.test.ts` coverage into `runtime/`, `modules/health/`, `modules/auth/`, `modules/users/`, `modules/providers/`, `guards/`, and `http/` test files.
  - Moved auth-service, document upload, knowledge-base, and runtime-service tests next to their owning API modules.
  - Split rate-limit tests into identities, limiter, and store coverage under `src/apps/api/src/rate-limit/`.
- 2026-05-25 API test classification verification:
  - `pnpm --filter @kb/api typecheck` passed.
  - `pnpm --filter @kb/api test` passed: 16 test files, 63 tests.
  - `pnpm --filter @kb/api lint` passed.
  - `git diff --check` passed.

## Open Questions

- None for the audit-only phase. The user selected: first audit and list spec violations plus phased plan; do not change backend code yet.
