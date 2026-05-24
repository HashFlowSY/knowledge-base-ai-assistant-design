# Model Service Backend API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the fixed `chat`, `embedding`, and `rerank` model service configuration page to real backend APIs with encrypted provider API keys, synchronous connection testing, idempotent saves, and safe summaries.

**Architecture:** Browser-safe provider schemas live at `@kb/ai-providers`; database-backed provider configuration logic lives behind `@kb/ai-providers/service`. Generic reversible secret encryption lives in `@kb/security`. `src/apps/api` exposes admin-only provider routes as thin HTTP adapters, and `src/apps/web` uses TanStack Query hooks plus the typed Hono RPC client.

**Tech Stack:** TypeScript, Zod, Hono, Hono RPC, Drizzle ORM, PostgreSQL, AES-256-GCM via Web Crypto, TanStack Query, React/Next.js.

---

### Task 1: Security Encryption Helper

**Files:**
- Modify: `src/packages/security/src/index.ts`
- Modify: `src/packages/security/src/index.test.ts`

- [ ] Write failing tests that prove AES-GCM encryption returns a structured envelope, uses a new IV per encryption, rejects tampered AAD, and never returns plaintext in the envelope.
- [ ] Run `pnpm --filter @kb/security test` and verify the tests fail because encryption helpers do not exist.
- [ ] Implement `normalizeAes256GcmKey`, `encryptAes256Gcm`, and `decryptAes256Gcm` using 256-bit keys, 96-bit IVs, 128-bit tags, and caller-supplied AAD.
- [ ] Run `pnpm --filter @kb/security test` and verify it passes.

### Task 2: Provider Contract And Service

**Files:**
- Modify: `src/packages/ai-providers/package.json`
- Modify: `tsconfig.base.json`
- Modify: `src/packages/ai-providers/src/index.ts`
- Create: `src/packages/ai-providers/src/service.ts`
- Modify: `src/packages/ai-providers/src/index.test.ts`
- Create: `src/packages/ai-providers/src/service.test.ts`

- [ ] Write failing contract tests for fixed service kinds, redacted slot summaries, save input validation, and encrypted-key request shape.
- [ ] Write failing service tests with an in-memory repository proving list returns three slots, first save requires a key, failed connection tests do not write, repeated save upserts the same `tenantId + kind`, and rotated keys update masked/key version metadata.
- [ ] Run `pnpm --filter @kb/ai-providers test` and verify those tests fail.
- [ ] Implement browser-safe schemas/types at the package root.
- [ ] Implement the server-only provider configuration service with repository and connection tester interfaces, AES-GCM secret handling, safe audit events, and database-backed factory.
- [ ] Run `pnpm --filter @kb/ai-providers test` and verify it passes.

### Task 3: Database Schema

**Files:**
- Modify: `src/packages/db/src/schema/provider.ts`
- Modify: `src/packages/db/src/index.test.ts`
- Add migration under `src/packages/db/drizzle/`
- Update `src/packages/db/drizzle/meta/_journal.json`
- Update latest Drizzle snapshot when generation is available.

- [ ] Write a failing `@kb/db` test that asserts `providerConfigs.baseUrl` exists and `provider_configs_tenant_kind_idx` is exported by the schema.
- [ ] Run `pnpm --filter @kb/db test` and verify it fails.
- [ ] Add `base_url` and `tenant_id + kind` unique index to the Drizzle schema.
- [ ] Generate or hand-create the matching migration, then run Drizzle generation as a no-op if possible.
- [ ] Run `pnpm --filter @kb/db test`.

### Task 4: API Routes

**Files:**
- Modify: `src/apps/api/src/contracts/services.ts`
- Modify: `src/apps/api/src/contracts/rpc.ts`
- Modify: `src/apps/api/src/default-services.ts`
- Modify: `src/apps/api/src/runtime-services.ts`
- Modify: `src/apps/api/src/app.ts`
- Create: `src/apps/api/src/modules/providers/types.ts`
- Create: `src/apps/api/src/modules/providers/router.ts`
- Create: `src/apps/api/src/modules/providers/procedures/list-providers.ts`
- Create: `src/apps/api/src/modules/providers/procedures/save-provider.ts`
- Modify: `src/apps/api/src/app.test.ts`
- Modify: `src/apps/api/package.json`
- Modify: `pnpm-lock.yaml` if package graph changes.

- [ ] Write failing API tests for `GET /api/providers`, admin-only protection, `PUT /api/providers/:kind`, validation errors, service error mapping, and no secret leakage.
- [ ] Run `pnpm --filter @kb/api test` and verify the tests fail.
- [ ] Add provider route dependencies, RPC route schema entries, router/procedures, runtime service wiring with `APP_ENCRYPTION_KEY`, and default stub behavior.
- [ ] Run `pnpm --filter @kb/api test` and verify it passes.

### Task 5: Frontend Providers Page

**Files:**
- Modify: `src/apps/web/package.json`
- Modify: `src/apps/web/src/features/api/client.test.ts`
- Create: `src/apps/web/src/features/admin/provider-hooks.ts`
- Modify: `src/apps/web/src/features/admin/provider-config-dialog.tsx`
- Modify: `src/apps/web/src/features/admin/admin-list-page.tsx`
- Modify: `src/apps/web/src/features/admin/admin-list-page.test.tsx` or adjacent provider page tests.

- [ ] Write failing frontend tests that prove `/providers` no longer shows the placeholder, renders three API-backed slots, uses provider hooks, and submits save requests through the API client.
- [ ] Run `pnpm --filter @kb/web test` and verify the tests fail.
- [ ] Add provider hooks, update the providers page UI, adapt the dialog to real API types, and keep only safe key metadata in component state.
- [ ] Run `pnpm --filter @kb/web test` and verify it passes.

### Task 6: Verification

- [ ] Run focused package tests: `pnpm --filter @kb/security test`, `pnpm --filter @kb/ai-providers test`, `pnpm --filter @kb/db test`, `pnpm --filter @kb/api test`, `pnpm --filter @kb/web test`.
- [ ] Run typechecks for changed packages: `pnpm --filter @kb/security typecheck`, `pnpm --filter @kb/ai-providers typecheck`, `pnpm --filter @kb/db typecheck`, `pnpm --filter @kb/api typecheck`, `pnpm --filter @kb/web typecheck`.
- [ ] Run repository-level `pnpm lint`, `pnpm typecheck`, and relevant `pnpm test` if time and environment allow.
- [ ] If database migration changed, run `pnpm db:generate` and report whether it is a no-op or blocked by environment/config.
