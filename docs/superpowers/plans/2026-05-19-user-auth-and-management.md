# User Auth And Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace frontend mock auth/user authority with project-owned `/api/auth/*` and `/api/users*` routes backed by Better Auth-compatible persistence, default-tenant membership, Docker Redis rate limiting, and TanStack Query.

**Architecture:** Keep HTTP concerns in `src/apps/api`, domain contracts and business rules in `@kb/auth` and `@kb/users`, schema/seed ownership in `@kb/db`, and browser server state in frontend feature hooks. Local Redis is provided by the existing Docker Compose `redis` service and is accessed only by the API limiter boundary.

**Tech Stack:** TypeScript, pnpm workspaces, Hono, Drizzle/Postgres, Better Auth, Redis/ioredis, Zod, TanStack Query, Next.js App Router, Vitest.

---

### Task 1: Shared Auth/User/API Contracts

**Files:**

- Modify: `src/packages/auth/src/index.ts`
- Modify: `src/packages/auth/src/index.test.ts`
- Modify: `src/packages/users/src/index.ts`
- Modify: `src/packages/users/src/index.test.ts`
- Create: `src/apps/api/src/contracts.ts`
- Create: `src/apps/api/src/contracts.test.ts`

- [x] Write failing tests for strict session payload, login input normalization, `UserSummary` using `id` with ISO timestamps and no `userId`/`tenantId`, and uniform API success/error envelopes.
- [x] Run `pnpm --filter @kb/auth test`, `pnpm --filter @kb/users test`, and `pnpm --filter @kb/api test` and confirm the new tests fail for missing contracts.
- [x] Implement the schemas/types in the owning packages and API contract module.
- [x] Re-run the same tests and confirm they pass.

### Task 2: Security Primitives And Redis Limiter Boundary

**Files:**

- Modify: `src/packages/security/src/index.ts`
- Modify: `src/packages/security/src/index.test.ts`
- Create: `src/apps/api/src/rate-limit.ts`
- Create: `src/apps/api/src/rate-limit.test.ts`

- [x] Write failing tests for SHA-256 hex hashing, session cookie hashing, IP/email identity key construction, Redis key format `kbai:ratelimit:{scope}:{window}:{identity}`, no raw secret values in keys, and `Retry-After` calculation.
- [x] Run `pnpm --filter @kb/security test` and `pnpm --filter @kb/api test` and confirm failures.
- [x] Implement generic hash helpers in `@kb/security` and an API-local limiter interface with in-memory and Redis adapters.
- [x] Re-run tests and confirm pass.

### Task 3: Auth Runtime And Dev Seed Helpers

**Files:**

- Modify: `src/packages/auth/src/index.ts`
- Modify: `src/packages/auth/src/index.test.ts`
- Modify: `src/packages/db/package.json`
- Create: `src/packages/db/src/seed-dev-auth.ts`
- Create: `src/packages/db/src/seed-dev-auth.test.ts`

- [x] Write failing tests for password hash helper shape, password verification, password account upsert input contract, session revocation input contract, and production seed refusal.
- [x] Run `pnpm --filter @kb/auth test` and `pnpm --filter @kb/db test` and confirm failures.
- [x] Implement Better Auth-compatible password/session helper boundaries without exposing raw password hashes in public payloads.
- [x] Add `seed:dev-auth` script that refuses `NODE_ENV=production` and is idempotent by contract.
- [x] Re-run package tests and typecheck.

### Task 4: User Domain Logic

**Files:**

- Modify: `src/packages/users/src/index.ts`
- Modify: `src/packages/users/src/index.test.ts`

- [x] Write failing tests for list input normalization, active default-tenant-only summaries, create/restore branching, update validation, self-protection, delete-access transaction unit requirements, and audit action names.
- [x] Run `pnpm --filter @kb/users test` and confirm failures.
- [x] Implement domain service contracts and pure decision helpers with explicit repository interfaces so tests do not need real Postgres.
- [x] Re-run `@kb/users` tests and typecheck.

### Task 5: Hono Auth And User Routes

**Files:**

- Modify: `src/apps/api/src/app.ts`
- Modify: `src/apps/api/src/app.test.ts`
- Create: `src/apps/api/src/auth.ts`
- Create: `src/apps/api/src/users.ts`
- Create: `src/apps/api/src/http.ts`
- Create: `src/apps/api/src/security.ts`

- [x] Write failing API tests for `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/session`, `/api/users*` envelope shape, no-body mutation body rejection, CSRF origin checks, admin guard, member forbidden, and rate-limit 429.
- [x] Run `pnpm --filter @kb/api test` and confirm failures.
- [x] Implement route modules using injected auth/user services for testability, standard response helpers, CSRF/content-type guards, actor/admin guards, and limiter middleware.
- [x] Re-run `@kb/api` tests, typecheck, and lint.

### Task 6: Frontend API Client, Session Gate, Login, And Shell

**Files:**

- Modify: `src/apps/web/src/app/layout.tsx`
- Modify: `src/apps/web/src/features/auth/login-page.tsx`
- Modify: `src/apps/web/src/features/auth/login-redirect.ts`
- Modify: `src/apps/web/src/features/shell/app-shell.tsx`
- Modify: `src/apps/web/src/features/shell/navigation.ts`
- Modify: `src/apps/web/src/features/shell/navigation.test.ts`
- Create: `src/apps/web/src/features/api/client.ts`
- Create: `src/apps/web/src/features/auth/auth-hooks.ts`
- Create: `src/apps/web/src/features/auth/session-gate.test.ts`

- [x] Write failing frontend tests for login calling `/api/auth/login`, already-authenticated login redirect, logout clearing query cache, role-based navigation from session role, no role switcher/reset/expire controls, and protected route decisions.
- [x] Run `pnpm --filter @kb/web test` and confirm failures.
- [x] Implement typed API fetch helpers, TanStack Query provider, auth hooks, and replace mock session authority in login/shell.
- [x] Re-run frontend tests and typecheck.

### Task 7: Frontend Users Page Migration

**Files:**

- Modify: `src/apps/web/src/features/admin/admin-list-page.tsx`
- Modify: `src/apps/web/src/features/admin/user-dialog.tsx`
- Modify: `src/apps/web/src/features/admin/admin-list-page.test.ts`
- Create: `src/apps/web/src/features/admin/user-hooks.ts`

- [x] Write failing tests for `/users` using API-backed query/mutations, URL list params in query key/request, no disabled/status workflow, create/edit/delete access calls, self admin disabled controls, and query invalidation.
- [x] Run `pnpm --filter @kb/web test` and confirm failures.
- [x] Migrate only the users kind to `@kb/users` API hooks while leaving unrelated admin mock pages in place for scope control.
- [x] Re-run frontend tests, typecheck, and lint.

### Task 8: Local API Proxy And Final Verification

**Files:**

- Modify: `src/apps/web/next.config.ts`
- Modify: `src/apps/web/next.config.test.ts`
- Modify: `.env.example`
- Modify: `src/apps/api/.env.example`
- Modify: `.trellis/spec/backend/audit.md`

- [x] Write failing tests for Next `/api/:path*` rewrite to `localhost:4000`, audit action spec containing `user.updated`, `user.access_removed`, and `user.password_reset`, and env examples documenting Docker Redis.
- [x] Implement config/spec updates.
- [x] Run targeted package tests plus `pnpm --filter @kb/api typecheck`, `pnpm --filter @kb/web typecheck`, `pnpm --filter @kb/db typecheck`, and relevant lint commands.
