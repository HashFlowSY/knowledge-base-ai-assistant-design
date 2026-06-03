# Align Ingestion Retry State With BullMQ

## Goal

Keep ingestion business state in PostgreSQL consistent with BullMQ execution state when file ingestion fails during embedding. In particular, a missing or disabled embedding provider should retry only up to the configured maximum attempts, then fail durably instead of leaving `ingestion_jobs.status = retrying` while BullMQ keeps the same job in `completed`.

## Background

The current file ingestion pipeline records retryable embedding failures in PostgreSQL, but returns `{ status: "failed" }` to the BullMQ worker instead of throwing. BullMQ treats a resolved processor promise as completed, so the Redis job is stored in `completed` while PostgreSQL says the business job is still `retrying`.

Recovery then correctly finds the stale `retrying` job, but it re-enqueues with the same stable BullMQ `jobId`. Because Redis still has that completed job, BullMQ emits `duplicated` events and does not enqueue work. The observed local job is stuck in this split state.

The observed local stuck job is background evidence only. This task prevents new inconsistent states and does not clean up or reprocess already-stuck local environment data.

## What I Already Know

* PostgreSQL `ingestion_jobs` is intended to be the durable source of truth; BullMQ is the execution transport.
* The current stuck job failed at `embedding` with `EMBEDDING_PROVIDER_NOT_CONFIGURED`.
* The same job satisfies recovery conditions: `retrying`, stale, source `available`, and `objectKey` exists.
* Redis queue events show periodic recovery attempts producing `duplicated` for the same stable job id.
* The user decision is: missing embedding provider should retry only until attempts are exhausted, then fail directly.
* No database migration is expected because `ingestion_jobs` already has `attempts`, `max_attempts`, and `status`.

## Requirements

* Retryable ingestion failures must not be returned to BullMQ as successful processor results.
* When a retryable failure occurs before `max_attempts` is reached:
  * PostgreSQL job status is `retrying`.
  * PostgreSQL document status is `failed` or another existing visible non-ready state used by the current UI.
  * BullMQ job is failed for that attempt and allowed to retry according to attempts/backoff.
* When `EMBEDDING_PROVIDER_NOT_CONFIGURED` or another retryable failure occurs on the final allowed attempt:
  * PostgreSQL job status becomes `failed`.
  * PostgreSQL job has `finished_at`.
  * PostgreSQL document status remains `failed`.
  * BullMQ job ends in `failed`, not `completed`.
  * Recovery no longer requeues that job.
* Non-retryable ingestion failures must fail PostgreSQL and BullMQ without further retries.
* Duplicate BullMQ deliveries must continue to be skipped safely when the persisted job cannot be claimed.
* Retry attempts must remain idempotent for chunks, embeddings, and search index documents for the same document version.
* The configured maximum queue attempts and persisted `ingestion_jobs.max_attempts` must not drift for newly created upload jobs.

## Proposed Design

### Attempts And State

`claimFileJob` should continue to atomically claim only `queued` and `retrying` jobs. It should return the incremented attempt count and persisted max attempts in the claim context.

Failure handling should compute whether another retry is allowed from the persisted context:

```text
canRetry = failure.retryable && context.attempts < context.maxAttempts
```

If `canRetry` is true, `failJob` writes `status = retrying` and leaves `finished_at = null`. If `canRetry` is false, `failJob` writes `status = failed` and sets `finished_at`.

### Pipeline And Worker Contract

The pipeline may still return a typed result for `completed`, `skipped`, and `failed`, but failed results must include `code`, `message`, `retryable`, and whether another retry is allowed. The BullMQ worker must map failed pipeline results to thrown errors so BullMQ does not record them as completed.

Recommended mapping:

* `completed` -> return normally.
* `skipped/already_claimed` -> return normally, because duplicate delivery is not a business failure.
* `failed` with another retry allowed -> throw a normal `Error` so BullMQ applies attempts/backoff.
* `failed` without another retry allowed -> throw an unrecoverable or final failure error so BullMQ ends in failed.

The implementation should avoid double-writing failure state. Failure should be recorded once in the ingestion repository, then the worker should throw only to synchronize BullMQ's execution state.

### Queue Attempts Configuration

New upload jobs should persist `max_attempts` from the same configured attempts value used to create the BullMQ producer. If the existing service boundary does not expose this value to the upload reservation code, extend the knowledge service options with a small ingestion queue settings object.

## Impacted Areas

* `src/apps/worker/src/index.ts` - map pipeline failed results to BullMQ failures.
* `src/packages/ingestion/src/contracts/types.ts` - extend claim context and failed result types.
* `src/packages/ingestion/src/pipeline/pipeline.ts` - compute bounded retry state and return enough failure metadata.
* `src/packages/ingestion/src/pipeline/steps.ts` - pass final retry decision into `failJob`.
* `src/packages/ingestion/src/repositories/drizzle.ts` - return attempts/max attempts from claim and set `retrying` versus `failed` based on bounded retry state.
* `src/packages/ingestion/src/recovery/recovery.ts` - should continue to recover only unfinished jobs; verify failed exhausted jobs are excluded.
* `src/packages/knowledge/src/operations/upload-document-file/*` - persist max attempts for new jobs if needed.
* `src/packages/knowledge/src/service/types.ts` and API runtime wiring - pass queue attempts into upload metadata creation if needed.
* Tests in ingestion, worker, queue/knowledge where state contracts are covered.

## Acceptance Criteria

* [x] A missing embedding provider on attempt 1 of 3 leaves PostgreSQL job `retrying` and causes BullMQ to retry instead of completing the job.
* [x] A missing embedding provider on attempt 3 of 3 leaves PostgreSQL job `failed`, sets `finished_at`, and causes BullMQ to end failed.
* [x] Recovery does not requeue jobs whose persisted status is `failed`.
* [x] Duplicate delivery still returns `skipped` without throwing and without writing duplicate chunks, embeddings, or search documents.
* [x] Newly created ingestion jobs persist `max_attempts` equal to configured ingestion queue attempts.
* [x] Existing successful ingestion behavior is unchanged.

## Testing Plan

* Add or update ingestion pipeline tests for retryable failure before max attempts and at max attempts.
* Add or update repository tests or fakes so `claimFileJob` exposes attempts/max attempts and `failJob` records the correct final state.
* Add worker-level unit coverage for pipeline failed results mapping to thrown BullMQ failures.
* Add coverage that duplicate already-claimed deliveries still resolve normally.
* Run targeted package tests for ingestion and worker.
* Run broader typecheck if the type contract changes cross packages.

## Out Of Scope

* URL ingestion behavior.
* New database schema or migration unless implementation proves existing fields are insufficient.
* A distributed transaction between PostgreSQL and Redis.
* Changing stable BullMQ job id semantics for normal duplicate enqueue collapse.
* Cleaning up or reprocessing already-stuck local environment data created before this fix.
* Changing provider configuration validation UX.
* Building an admin retry button or task management UI.

## Technical Notes

* PRD reference: `docs/superpowers/plans/2026-05-24-document-ingestion-pipeline.md` says PostgreSQL `ingestion_jobs` is the durable source of truth and BullMQ is execution transport.
* Worker currently returns the pipeline result directly from the BullMQ processor.
* Pipeline currently records embedding failure and returns `{ status: "failed" }`.
* BullMQ moves resolved processor results to `completed`; it moves thrown errors to failed/retry handling.
* Redis events for the observed local job show repeated `duplicated` events every recovery interval.
* Relevant specs: `.trellis/spec/backend/worker-queue.md`, `.trellis/spec/backend/database.md`, `.trellis/spec/backend/rag-ingestion.md`, `.trellis/spec/testing/strategy.md`.

## Definition Of Done

* [x] PRD reviewed and approved.
* [x] Implementation plan is created after approval.
* [x] Tests added or updated for bounded retry and state consistency.
* [x] Targeted tests pass.
* [x] Typecheck passes for changed packages or the repo-level command if needed.

## Verification

* `pnpm --filter @kb/ingestion test -- src/tests/pipeline.test.ts`
* `pnpm --filter @kb/worker test -- src/lifecycle.test.ts`
* `pnpm --filter @kb/ingestion typecheck`
* `pnpm --filter @kb/worker typecheck`
* `pnpm --filter @kb/knowledge typecheck`
* `pnpm --filter @kb/api typecheck`
* `pnpm --filter @kb/api test -- src/runtime/services.test.ts`
* `pnpm --filter @kb/knowledge test -- src/operations/upload-document-file/tests/reservation.test.ts`
* `pnpm --filter @kb/ingestion lint`
* `pnpm --filter @kb/worker lint`
* `pnpm --filter @kb/knowledge lint`
* `pnpm --filter @kb/api lint`
* `git diff --check`
