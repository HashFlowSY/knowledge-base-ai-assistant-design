# Split ingestion Drizzle repository

## Goal

Split `src/packages/ingestion/src/repositories/drizzle.ts` because it has grown too long and its filename only names the ORM instead of the ingestion responsibilities it implements.

## What I Already Know

- The current file is about 568 lines.
- It implements `IngestionPipelineRepository`, `IngestionRecoveryRepository`, and `IngestionCleanupRepository` in one factory.
- `src/packages/ingestion/src/index.ts` publicly re-exports `./repositories/drizzle`.
- Recovery tests dynamically import `../repositories/drizzle.ts`; structure tests explicitly list `repositories/drizzle.ts`.
- The RAG package already uses a pattern where a Drizzle repository factory delegates responsibility-specific operations to smaller Drizzle files.

## Requirements

- Replace the oversized `repositories/drizzle.ts` implementation with responsibility-named files.
- Preserve the public factory name `createDrizzleIngestionRepository`.
- Preserve the public root export from `@kb/ingestion`.
- Keep behavior unchanged for pipeline job claiming, source loading, step logging, output persistence, job completion/failure, source cleanup, and recovery listing.
- Keep new files under `src/packages/ingestion/src/repositories/`.
- Update tests that assert repository file layout or import the old file path.

## Acceptance Criteria

- `drizzle.ts` is removed or reduced to a compatibility-free barrel that no longer contains the full implementation.
- New repository filenames describe their functional responsibilities.
- `createDrizzleIngestionRepository` still returns an object satisfying `IngestionPipelineRepository & IngestionRecoveryRepository & IngestionCleanupRepository`.
- Existing ingestion public imports continue to work through `@kb/ingestion`.
- Structure tests reflect the new file layout.
- Relevant tests, lint, and typecheck pass.

## Out of Scope

- Changing database queries or ingestion behavior.
- Renaming public interfaces in `contracts/types.ts`.
- Changing package export paths outside the existing public ingestion entrypoint.
- Adding new runtime dependencies.

## Technical Notes

- Relevant specs:
  - `.trellis/spec/backend/rag-ingestion.md`
  - `.trellis/spec/backend/database.md`
  - `.trellis/spec/backend/package-boundaries.md`
  - `.trellis/spec/shared/code-quality.md`
  - `.trellis/spec/shared/typescript.md`
  - `.trellis/spec/testing/strategy.md`
- Recommended split:
  - `drizzle-ingestion-repository.ts`: public aggregation factory.
  - `drizzle-pipeline-repository.ts`: pipeline contract aggregation factory.
  - `drizzle-file-job-repository.ts`: file job claiming, logging, completion, and failure state transitions.
  - `drizzle-file-source-repository.ts`: file source loading from document source rows and object storage.
  - `drizzle-ingestion-output-repository.ts`: chunk and embedding persistence.
  - `drizzle-source-cleanup-repository.ts`: source object cleanup methods.
  - `drizzle-recovery-repository.ts`: recoverable job listing.
  - Single-use helpers stay private to the responsibility file that uses them.
