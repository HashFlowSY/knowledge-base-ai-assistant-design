# Document File Upload Save Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the backend-only document file upload save path with real object storage, metadata reservation, idempotent checksum dedupe, and upload safety controls.

**Architecture:** The API module handles HTTP/auth/content-length/multipart/file validation and maps service results into the shared response envelope. The `@kb/knowledge` service owns tenant/knowledge-base authorization, DB reservation/finalization, duplicate lookup, ingestion job metadata, and transactional audit writes. The `@kb/storage` package owns S3-compatible object storage client creation, upload/delete helpers, and object key generation.

**Tech Stack:** TypeScript, Hono, Zod, Drizzle/PostgreSQL, Vitest, AWS SDK S3-compatible client, pnpm workspace packages.

---

### Task 1: Schema And Config Contracts

**Files:**
- Modify: `src/packages/db/src/schema/knowledge.ts`
- Modify: `src/packages/db/src/schema/ingestion.ts`
- Modify: `src/packages/db/src/index.test.ts`
- Modify: `src/packages/config/src/index.ts`
- Modify: `src/packages/config/src/index.test.ts`
- Modify: `src/apps/api/.env.example`

- [ ] **Step 1: Write failing tests**

Add db/config tests that assert:
- `documentSources.bucket` exists and is required by schema metadata.
- `documentSources.uploadStatus`, `scanStatus`, and object cleanup status columns exist.
- `ingestionJobStatusEnum` accepts `pending_source`.
- upload config defaults are `8 * 1024 * 1024`, actor rate limit `20`, actor concurrency `2`, tenant concurrency `10`.

- [ ] **Step 2: Verify red**

Run: `pnpm --filter @kb/db test -- src/index.test.ts && pnpm --filter @kb/config test -- src/index.test.ts`

Expected: tests fail because the new schema/config fields do not exist.

- [ ] **Step 3: Implement schema/config**

Add upload, scan, cleanup enums/columns and `bucket` to `document_sources`; add `pending_source` to `ingestion_jobs.status`; add validated runtime config fields and env example entries.

- [ ] **Step 4: Verify green**

Run: `pnpm --filter @kb/db test -- src/index.test.ts && pnpm --filter @kb/config test -- src/index.test.ts`

Expected: tests pass.

### Task 2: Storage Boundary

**Files:**
- Modify: `src/packages/storage/src/index.ts`
- Modify: `src/packages/storage/src/index.test.ts`
- Modify: `src/packages/storage/package.json`
- Modify: `src/apps/api/package.json`
- Modify: `tsconfig.base.json`

- [ ] **Step 1: Write failing tests**

Update storage tests so `createDocumentObjectKey` expects:

```text
tenants/{tenantId}/knowledge-bases/{knowledgeBaseId}/documents/{documentId}/versions/{documentVersion}/source/{filename}
```

Add tests for a fake-compatible `ObjectStorageClient` contract and S3 config parsing.

- [ ] **Step 2: Verify red**

Run: `pnpm --filter @kb/storage test`

Expected: object key format test fails.

- [ ] **Step 3: Implement storage helpers**

Add `knowledgeBaseId`, `documentVersion`, and `kind` to object key generation. Add narrow `ObjectStorageClient` interface, `putObject`, `deleteObject`, and S3-compatible client factory using local package dependency.

- [ ] **Step 4: Verify green**

Run: `pnpm --filter @kb/storage test`

Expected: storage tests pass.

### Task 3: Knowledge Upload Service

**Files:**
- Modify: `src/packages/knowledge/src/schemas.ts`
- Modify: `src/packages/knowledge/src/index.ts`
- Modify: `src/packages/knowledge/src/service-types.ts`
- Modify: `src/packages/knowledge/src/service.ts`
- Add: `src/packages/knowledge/src/operations/upload-document-file.ts`
- Modify: `src/packages/knowledge/src/service-queries.ts`
- Add/Modify: `src/packages/knowledge/src/index.test.ts`
- Add/Modify: `src/packages/knowledge/src/service.test.ts`
- Modify: `src/packages/knowledge/package.json`
- Modify: `tsconfig.base.json`

- [ ] **Step 1: Write failing service tests**

Cover:
- admin can reserve/upload/finalize in any tenant KB.
- member can upload only authorized KB.
- duplicate checksum in same tenant+KB returns existing document/job and writes `document.duplicate_upload_ignored`.
- object upload failure retains failed metadata and failed job.
- final DB failure after object upload attempts delete and records cleanup failure if delete fails.
- no BullMQ producer is called.

- [ ] **Step 2: Verify red**

Run: `pnpm --filter @kb/knowledge test`

Expected: upload service tests fail because the service method does not exist.

- [ ] **Step 3: Implement service**

Create `uploadDocumentFile` that performs duplicate lookup, reservation transaction, storage upload, finalization transaction, and compensation. Keep the API response schema small: document summary, source summary, job summary, and `duplicate` boolean.

- [ ] **Step 4: Verify green**

Run: `pnpm --filter @kb/knowledge test`

Expected: knowledge package tests pass.

### Task 4: API Upload Route

**Files:**
- Add: `src/apps/api/src/modules/documents/types.ts`
- Add: `src/apps/api/src/modules/documents/router.ts`
- Add: `src/apps/api/src/modules/documents/procedures/upload-document-file.ts`
- Add: `src/apps/api/src/modules/documents/lib/file-validation.ts`
- Modify: `src/apps/api/src/contracts/services.ts`
- Modify: `src/apps/api/src/contracts/rpc.ts`
- Modify: `src/apps/api/src/app.ts`
- Modify: `src/apps/api/src/default-services.ts`
- Modify: `src/apps/api/src/session-guards.ts`
- Modify: `src/apps/api/src/rate-limit.ts`
- Add/Modify: `src/apps/api/src/document-upload.test.ts`

- [ ] **Step 1: Write failing API tests**

Cover:
- unauthenticated upload rejects before multipart parsing/service/storage.
- valid upload passes exactly one file, title fallback, checksum, and config limits to service.
- zero/multiple file parts reject.
- missing/invalid/non-positive/over-limit `Content-Length` rejects before parsing.
- actual file bytes over limit reject.
- unsupported/spoofed file type rejects and audits sensitive failure when actor exists.
- actor rate limit uses `document-upload`, limit `20`, window `1m`.
- concurrency limiter rejects actor limit `2` and tenant limit `10`.

- [ ] **Step 2: Verify red**

Run: `pnpm --filter @kb/api test -- src/document-upload.test.ts`

Expected: route/tests fail because the route and dependencies do not exist.

- [ ] **Step 3: Implement route**

Add `POST /api/knowledge-bases/:knowledgeBaseId/documents/upload`. Authenticate before parsing body, enforce actor rate/concurrency limits, validate content length/content type/multipart parts/file type/signature/size, compute checksum, and call the knowledge service.

- [ ] **Step 4: Verify green**

Run: `pnpm --filter @kb/api test -- src/document-upload.test.ts`

Expected: upload API tests pass.

### Task 5: Runtime Wiring And Verification

**Files:**
- Modify: `src/apps/api/src/runtime-services.ts`
- Modify: `src/apps/api/src/runtime-services.test.ts`
- Modify: `src/packages/db/drizzle/*`
- Modify: `pnpm-lock.yaml`
- Modify: `.trellis/tasks/05-22-document-file-upload-save/prd.md`

- [ ] **Step 1: Runtime tests**

Update runtime wiring tests so config creates the knowledge service with object storage, bucket, upload limits, rate limits, and concurrency settings.

- [ ] **Step 2: Migration generation**

Run `pnpm db:generate` after schema edits and inspect the generated SQL. If Drizzle cannot express the partial unique index exactly, add handwritten migration SQL:

```sql
CREATE UNIQUE INDEX "document_sources_active_file_hash_idx"
  ON "document_sources" ("tenant_id", "knowledge_base_id", "source_type", "source_hash")
  WHERE "upload_status" IN ('pending_upload', 'available');
```

- [ ] **Step 3: Full checks**

Run:
- `pnpm --filter @kb/db test`
- `pnpm --filter @kb/config test`
- `pnpm --filter @kb/storage test`
- `pnpm --filter @kb/knowledge test`
- `pnpm --filter @kb/api test`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`

- [ ] **Step 4: Finish**

Update PRD acceptance boxes that are fully implemented, record any explicitly deferred integration checks, then commit all task changes.
