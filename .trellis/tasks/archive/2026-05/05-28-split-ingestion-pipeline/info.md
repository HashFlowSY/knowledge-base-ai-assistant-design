# Split Ingestion Pipeline Implementation Plan

> **For agentic workers:** This task is executed inline in the main Codex session per Trellis codex-inline workflow. Do not spawn implementation sub-agents unless the main session explicitly delegates a non-overlapping read-only check.

**Goal:** Split `src/packages/ingestion/src/index.ts` into functional directories while preserving the `@kb/ingestion` public API and existing behavior.

**Architecture:** Keep `src/packages/ingestion/src/index.ts` as a barrel file. Move implementation into `contracts/`, `parsing/`, `chunking/`, `pipeline/`, `repositories/`, `recovery/`, and `tests/`. The worker and other consumers continue importing from `@kb/ingestion`.

**Tech Stack:** TypeScript, Zod, Drizzle ORM, Vitest, existing workspace packages.

---

### Task 1: Add Structural Contract Test

**Files:**
- Create: `src/packages/ingestion/src/tests/structure.test.ts`

- [ ] Add a Vitest test that asserts split implementation files live in functional directories and `src/packages/ingestion/src/index.ts` remains a small barrel.
- [ ] Run the structural test and confirm it fails before implementation because directories/files do not exist yet.

### Task 2: Extract Shared Contracts

**Files:**
- Create: `src/packages/ingestion/src/contracts/schemas.ts`
- Create: `src/packages/ingestion/src/contracts/errors.ts`
- Create: `src/packages/ingestion/src/contracts/types.ts`
- Modify: `src/packages/ingestion/src/index.ts`

- [ ] Move public schemas, `IngestionError`, and shared interfaces/types into `contracts/`.
- [ ] Re-export public contracts from `index.ts`.
- [ ] Keep no implementation files directly under `src/packages/ingestion/src/` except `index.ts`.

### Task 3: Extract Parsing and Chunking

**Files:**
- Create: `src/packages/ingestion/src/parsing/parser.ts`
- Create: `src/packages/ingestion/src/parsing/pdf.ts`
- Create: `src/packages/ingestion/src/parsing/text.ts`
- Create: `src/packages/ingestion/src/chunking/chunker.ts`
- Create: `src/packages/ingestion/src/chunking/boundaries.ts`

- [ ] Move document format detection, PDF parser compatibility, text normalization, chunk creation, boundary detection, token estimation, and hashing into the functional directories.
- [ ] Preserve `parseDocument`, `normalizeParsedText`, and `chunkParsedDocument` public exports through `index.ts`.

### Task 4: Extract Pipeline, Repository, and Recovery

**Files:**
- Create: `src/packages/ingestion/src/pipeline/pipeline.ts`
- Create: `src/packages/ingestion/src/pipeline/embedding-batches.ts`
- Create: `src/packages/ingestion/src/pipeline/steps.ts`
- Create: `src/packages/ingestion/src/repositories/drizzle.ts`
- Create: `src/packages/ingestion/src/repositories/mappers.ts`
- Create: `src/packages/ingestion/src/recovery/recovery.ts`

- [ ] Move `createIngestionPipeline`, embedding batching, step recording/failure handling, `createDrizzleIngestionRepository`, and `recoverIngestionJobs`.
- [ ] Preserve idempotency and retry behavior.
- [ ] Keep repository SQL and Drizzle mapping isolated under `repositories/`.

### Task 5: Split Tests and Verify

**Files:**
- Replace: `src/packages/ingestion/src/index.test.ts`
- Create: `src/packages/ingestion/src/tests/parsing.test.ts`
- Create: `src/packages/ingestion/src/tests/chunking.test.ts`
- Create: `src/packages/ingestion/src/tests/pipeline.test.ts`

- [ ] Move existing tests by behavior without weakening assertions.
- [ ] Run ingestion package tests.
- [ ] Run lint and typecheck.
- [ ] Fix only issues caused by this refactor.

### Quality Gate

- [ ] `pnpm --filter @kb/ingestion test`
- [ ] `pnpm typecheck`
- [ ] `pnpm lint`
