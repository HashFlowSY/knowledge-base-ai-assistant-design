# Backend Code Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split backend API and package files by responsibility without changing runtime behavior or adding features.

**Architecture:** Keep public package/app entry points compatible, then move implementation details into focused modules. API routes become domain modules; package files split contracts, pure helpers, service facades, operations, and runtime adapters.

**Tech Stack:** TypeScript, Hono, Zod, Better Auth, Drizzle, Vitest, pnpm.

---

### Task 1: Baseline Verification

**Files:**
- Read: `.trellis/tasks/05-20-backend-code-refactor/prd.md`
- No production edits.

- [x] Run baseline tests before refactor.

Run:

```bash
pnpm --filter @kb/api test
pnpm --filter @kb/users test
pnpm --filter @kb/queue test
pnpm --filter @kb/auth test
pnpm --filter @kb/db test
```

Expected: all five commands pass before structural edits.

### Task 2: Split API Contracts And Domain Routes

**Files:**
- Modify: `src/apps/api/src/app.ts`
- Modify: `src/apps/api/src/contracts.ts`
- Modify: `src/apps/api/src/user-routes.ts`
- Create focused API contract and module files under `src/apps/api/src/contracts/` and `src/apps/api/src/modules/`

- [x] Move `ApiContextVariables` and `ApiEnv` into a context contract module.
- [x] Move service interfaces and `ApiAppOptions` into a service/options contract module.
- [x] Move Hono RPC route schema and `ApiApp` type into an RPC contract module.
- [x] Keep `src/apps/api/src/contracts.ts` as a compatibility barrel.
- [x] Move health schema/router into `modules/health`.
- [x] Move auth endpoint handlers into `modules/auth/procedures`.
- [x] Move user endpoint handlers into `modules/users/procedures`.
- [x] Keep route paths, validation, rate-limit order, response envelopes, status codes, and messages identical.

### Task 3: Split API Auth Service Internals

**Files:**
- Modify: `src/apps/api/src/auth-service.ts`
- Create focused files under `src/apps/api/src/services/auth/`

- [x] Move Better Auth service factory implementation into a focused service file.
- [x] Move cookie/sign-out helpers into a helper file.
- [x] Move auth service error constructors and Better Auth unauthorized detection into an errors file.
- [x] Keep `src/apps/api/src/auth-service.ts` as a compatibility barrel for existing imports and tests.

### Task 4: Split Users Package Public Contracts And Service Operations

**Files:**
- Modify: `src/packages/users/src/index.ts`
- Modify: `src/packages/users/src/service.ts`
- Create focused files under `src/packages/users/src/operations/` and package root helpers as needed.

- [x] Move domain error schema/types into a focused browser-safe contract file.
- [x] Move pure plan/assert helpers into a focused browser-safe plan file.
- [x] Keep `src/packages/users/src/index.ts` exporting the same public schemas, types, and pure helpers.
- [x] Move `UserManagementService` and options types into a service types file.
- [x] Move list/get/create/update/remove service methods into operation files.
- [x] Keep `src/packages/users/src/service.ts` as the server-only service facade exported by `@kb/users/service`.

### Task 5: Split Additional Package Files

**Files:**
- Modify: `src/packages/db/src/seed-dev-auth.ts`
- Modify: `src/packages/queue/src/index.ts`
- Modify: `src/packages/auth/src/server.ts`
- Create focused helper/contract/runtime files as needed.

- [x] Split `db` dev auth seed contracts/defaults, Postgres repository adapter, and environment bootstrap from seed orchestration.
- [x] Split `queue` URL host/IP validation helpers from public queue/job schemas while keeping `@kb/queue` exports compatible.
- [x] Split `auth` server runtime helpers from the server-only public barrel while keeping `@kb/auth/server` exports compatible.
- [x] Do not split Drizzle schema files unless non-schema logic is found.

### Task 6: Final Verification

**Files:**
- All touched files.

- [x] Run targeted package tests.

```bash
pnpm --filter @kb/api test
pnpm --filter @kb/users test
pnpm --filter @kb/queue test
pnpm --filter @kb/auth test
pnpm --filter @kb/db test
```

- [x] Run global quality gates.

```bash
pnpm typecheck
pnpm lint
```

Expected: all commands exit 0.
