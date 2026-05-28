# Provider Config Service Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the oversized `@kb/ai-providers/service` implementation without changing behavior or public imports.

**Architecture:** Keep `src/packages/ai-providers/src/service.ts` as the stable compatibility entrypoint. Move implementation into focused modules for service types, config service, connection testing, embedding, provider endpoint helpers, secret handling, and repositories. Split the existing broad test file into module-focused tests.

**Tech Stack:** TypeScript, Vitest, Zod, Drizzle ORM, existing `@kb/security` AES-GCM helpers.

---

### Task 1: Lock Structural Boundary

**Files:**
- Create: `src/packages/ai-providers/src/service-boundary.test.ts`

- [x] Add a failing Vitest contract test that asserts `service.ts` stays a small compatibility entrypoint and does not import Drizzle, Zod, DB tables, or security primitives directly.
- [x] Run `pnpm --filter @kb/ai-providers test -- service-boundary.test.ts` and confirm it fails against the current large implementation.

### Task 2: Split Production Modules

**Files:**
- Modify: `src/packages/ai-providers/src/service.ts`
- Modify: `src/packages/ai-providers/src/runtime.ts`
- Create: `src/packages/ai-providers/src/shared/service-types.ts`
- Create: `src/packages/ai-providers/src/shared/provider-service-errors.ts`
- Create: `src/packages/ai-providers/src/provider-config/provider-config-service.ts`
- Create: `src/packages/ai-providers/src/provider-config/provider-config-summary.ts`
- Create: `src/packages/ai-providers/src/provider-config/provider-secrets.ts`
- Create: `src/packages/ai-providers/src/embedding/embedding-service.ts`
- Create: `src/packages/ai-providers/src/connection/connection-tester.ts`
- Create: `src/packages/ai-providers/src/provider-http/provider-endpoints.ts`
- Create: `src/packages/ai-providers/src/repositories/provider-repository-memory.ts`
- Create: `src/packages/ai-providers/src/repositories/provider-repository-drizzle.ts`
- Create: `src/packages/ai-providers/src/runtime/runtime-service.ts`

- [x] Move code mechanically by responsibility, preserving exported names, signatures, constants, error codes, messages, and endpoint behavior.
- [x] Leave `service.ts` as re-exports only so existing `@kb/ai-providers/service` imports remain valid.

### Task 3: Split Tests

**Files:**
- Delete: `src/packages/ai-providers/src/service.test.ts`
- Create: `src/packages/ai-providers/src/provider-config/provider-config-service.test.ts`
- Create: `src/packages/ai-providers/src/connection/connection-tester.test.ts`
- Create: `src/packages/ai-providers/src/embedding/embedding-service.test.ts`
- Create: `src/packages/ai-providers/src/testing/service.test-helpers.ts`

- [x] Move existing provider config tests unchanged in behavior.
- [x] Move existing connection tester tests unchanged in behavior.
- [x] Move existing embedding tests unchanged in behavior.

### Task 4: Verify

- [x] Run `pnpm --filter @kb/ai-providers test`.
- [x] Run `pnpm --filter @kb/ai-providers typecheck`.
- [x] Run broader checks only if public exports or cross-package consumers require it.
