# backend: document file upload save

## Goal

Implement the backend-only file upload save path for documents. An authenticated user uploads a supported file to a knowledge base; the API validates permissions and file constraints, writes the source object to S3-compatible storage, persists document/source/job metadata in PostgreSQL, and returns the created document plus queued ingestion job metadata.

This task does not implement frontend upload UI, URL ingestion, BullMQ enqueueing, parsing, chunking, embeddings, or search indexing.

## What I Already Know

- The user requested task creation only after unclear questions were resolved.
- Scope is backend real save path for file upload only.
- Supported upload types are PDF, Markdown, and TXT.
- Upload size limit defaults to 8 MB and must be configurable, not hard-coded in business logic.
- `multipart/form-data` may include `title`; if omitted or blank, title defaults to the uploaded filename without its extension.
- After successful upload, create a database `ingestion_jobs` row with queued status, but do not enqueue BullMQ yet.
- Authorization rule: `admin` can upload to any knowledge base in the tenant; `member` can upload only to knowledge bases where they are authorized.
- Current frontend document pages still use mock data.
- Existing DB schema includes `knowledge_bases`, `knowledge_base_members`, `documents`, `document_sources`, `ingestion_jobs`, and `ingestion_job_logs`.
- Existing `@kb/storage` has object key filename sanitization, but its current object key format is narrower than the storage spec.
- Existing API runtime injects auth, audit, rate limiter, and user service, but not a document/knowledge service or object storage service.
- Schema changes are allowed when needed for safe upload consistency.

## Requirements

- Add a backend API route for file upload into a target knowledge base.
- Accept `multipart/form-data` containing:
  - exactly one required file field;
  - optional `title` field.
- Validate before object write:
  - authenticated actor exists;
  - target knowledge base belongs to actor tenant;
  - actor has upload permission under the agreed authorization rule;
  - `Content-Length` is present, parseable, positive, and within the configured upload request limit before reading the multipart body;
  - file size is within configurable max upload size, default 8 MB;
  - MIME type and extension are allowed for PDF, Markdown, or TXT;
  - lightweight file signature checks pass;
  - upload object key is generated server-side.
- Reject multipart requests that contain zero files or more than one file part, even if only one field is named `file`.
- Persist metadata transactionally where practical:
  - `documents` row with pending status and `currentVersion = 1`;
  - `document_sources` row with `sourceType = "file"`, source URI, MIME type, size, object key, checksum/hash, and upload/storage status;
  - `ingestion_jobs` row with source type `file`, initially not processable until the object upload is confirmed.
- Store the original uploaded bytes in S3-compatible object storage using validated runtime configuration.
- Return standard API success envelope containing document and ingestion job summary.
- Return standard API error envelope for validation, auth, payload size, unsupported media type, not found, conflict, rate limit, and internal failures.
- Add or update tests covering validation, authorization, metadata persistence, storage invocation, title fallback, and no BullMQ enqueueing.
- Keep domain behavior in packages where appropriate; API handlers should own HTTP parsing, auth, validation, and response mapping.

## Security Requirements

- Detect duplicate uploads by content checksum, not by filename or title. Renaming a file must not bypass duplicate detection.
- Define explicit behavior for duplicate content within the same tenant and knowledge base before implementation.
- Support request idempotency for accidental retries or repeated clicks with file content checksum plus database uniqueness/transaction conflict handling; do not require a client-provided `Idempotency-Key` in the first implementation.
- Upload mutation routes must be rate-limited after actor resolution at `20` upload attempts per authenticated actor per minute.
- Unauthenticated or failed-auth requests must be rejected and must not enter file parsing, checksum calculation, database mutation, or object storage upload paths.
- Upload persistence must guard against concurrent duplicate creation, preferably with a database-level uniqueness constraint or transaction-safe equivalent.
- For duplicate content in the same tenant and knowledge base, return the existing document and job summary without creating new `documents`, `document_sources`, `ingestion_jobs`, or object storage records.
- Duplicate detection applies only to active documents. Future deleted or archived documents must not block re-upload unless a later task explicitly changes that policy.
- Upload processing must enforce configurable concurrency limits: at most `2` concurrent uploads per actor and at most `10` concurrent uploads per tenant.
- Validate lightweight file signatures in addition to MIME type and extension:
  - PDF must start with `%PDF-`;
  - TXT and Markdown must pass text safety checks such as no NUL bytes and no excessive control-character ratio;
  - Markdown uses text safety checks plus `.md` or `.markdown` extension.
- Require a trustworthy request-size gate before body parsing:
  - upload requests must include `Content-Length`;
  - missing, invalid, non-positive, or over-limit `Content-Length` fails before multipart parsing;
  - `Content-Length` is an early rejection signal only, and implementation must still enforce the actual read file byte limit;
  - multipart request limit may allow small form overhead beyond the configured file-size limit, but the uploaded file bytes must not exceed the configured file-size limit.
- Accept exactly one file part per upload request. Multiple file parts must fail validation instead of being ignored.
- Audit every successful new upload with action `document.uploaded`.
- Audit duplicate-content uploads that return an existing document with action `document.duplicate_upload_ignored`.
- Audit upload compensation failures that leave an orphaned object with action `document.upload_cleanup_failed` when actor and database context are available.
- Audit security-sensitive upload failures only, including forbidden knowledge-base upload attempts, spoofed file signatures, unsupported file types, and oversized files. Routine unauthenticated requests may return `UNAUTHORIZED` without a document-specific audit record unless actor context is available.
- Audit metadata must be minimal and structured. It may include `knowledgeBaseId`, `documentId`, `jobId`, `sourceType`, `mimeType`, `sizeBytes`, and checksum/hash value or short digest. It must not include raw file content, full object credentials, database URLs, or complete document text.
- Object storage writes and database writes must have a clear failure compensation strategy so failed requests do not leave authorized-visible orphan records.
- Use a database-backed upload state machine instead of holding a database transaction open during object storage I/O:
  - first transaction reserves `documents`, `document_sources`, and `ingestion_jobs` metadata with `document_sources.uploadStatus = "pending_upload"` and `ingestion_jobs.status = "pending_source"`;
  - object storage upload runs after reservation using the server-generated object key;
  - successful object upload must be finalized by a single DB transaction that marks the source available, changes the ingestion job to `queued`, and writes the `document.uploaded` audit record;
  - if the finalization transaction fails after object storage upload succeeded, the API must not return success; it must attempt best-effort deletion of the uploaded object and then mark the reserved source/job as failed with a safe failure reason;
  - if that best-effort object deletion also fails, the source/job must still be marked failed when the database is available, the object must remain unavailable through application APIs, and the cleanup failure must be stored as an orphaned-object cleanup failure for later operational cleanup;
  - failed object upload retains the reserved rows as failed records in a transaction-safe way, marks the ingestion job failed, and records a safe failure reason;
  - reserved rows must not be treated as usable documents until object upload is confirmed.
- Modify `document_sources` schema to add upload and scan status enums:
  - `uploadStatus`: `pending_upload | available | upload_failed`;
  - `scanStatus`: `not_scanned | pending | clean | infected | scan_failed`.
- Add upload failure/confirmation fields to `document_sources` so failed reservations remain diagnosable:
  - `bucket`;
  - `uploadedAt`;
  - `uploadErrorCode`;
  - `uploadErrorMessage`.
- Add object cleanup tracking fields to `document_sources` so compensation failures remain queryable:
  - `objectCleanupStatus`: `not_required | pending_cleanup | cleanup_succeeded | cleanup_failed`;
  - `objectCleanupErrorCode`;
  - `objectCleanupErrorMessage`.
- Modify `ingestion_jobs` schema to add a non-processable `pending_source` status. Workers must only process `queued` jobs, never `pending_source` jobs.
- Add a database-level duplicate guard for active file sources in the same knowledge base. Target semantics:
  - unique on `tenant_id`, `knowledge_base_id`, `source_type`, `source_hash`;
  - applies to `uploadStatus IN ("pending_upload", "available")`;
  - excludes `upload_failed`, so failed upload reservations do not block retrying the same file;
  - may need a handwritten partial unique index migration if Drizzle cannot express the exact partial index.
- Current task does not integrate malware/antivirus scanning. For a successful upload in this task, set `uploadStatus = "available"` and `scanStatus = "not_scanned"`.
- For object upload failure, retain failed records with `uploadStatus = "upload_failed"` and a safe failure reason. The scan status should remain `not_scanned` unless a later scan workflow sets a more specific value.
- For finalization failure after object upload success, retain failed metadata records with `uploadStatus = "upload_failed"`, `ingestion_jobs.status = "failed"`, and a safe failure reason after best-effort object cleanup.
- If finalization failure compensation cannot delete the uploaded object, set `objectCleanupStatus = "cleanup_failed"`, store a safe cleanup error code/message, and write `document.upload_cleanup_failed` audit when the database is available. The orphaned object must not be exposed as a usable source or through signed URLs.
- This task does not implement an asynchronous cleanup worker, but it must persist enough tenant, knowledge-base, document, bucket, object key, and cleanup status metadata for a later reconciliation job or manual operation to safely delete orphaned objects. `bucket` must be stored as a first-class `document_sources` column, not only inside JSON metadata.
- `pending_upload` and `upload_failed` sources must not be treated as usable sources or processable ingestion inputs.
- Current MVP determines source usability only from `uploadStatus`. `scanStatus` is stored for future malware scanning workflows but does not gate current document availability or future ingestion processing in this task.
- Failed upload records are retained for audit and operations visibility. They must not be treated as duplicate-active documents, usable sources, or processable ingestion jobs.

## Configuration

- Introduce a runtime-configured upload size limit with default `8 MiB` (`8 * 1024 * 1024` bytes).
- The limit must be configurable via environment variable and documented in env examples.
- Business logic must consume parsed runtime config instead of embedding a magic number in upload handlers.
- Storage endpoint, bucket, access key, and secret continue to come from runtime configuration.
- Upload route actor rate limits and upload concurrency limits should be configurable through validated runtime configuration.

## Acceptance Criteria

### Schema and Configuration

- [x] `document_sources` includes `uploadStatus` enum values `pending_upload`, `available`, and `upload_failed`.
- [x] `document_sources` includes `scanStatus` enum values `not_scanned`, `pending`, `clean`, `infected`, and `scan_failed`.
- [x] `document_sources` includes a required `bucket` field for object storage location and cleanup.
- [x] `document_sources` includes `uploadedAt`, `uploadErrorCode`, and `uploadErrorMessage` fields.
- [x] `document_sources` includes object cleanup tracking fields: `objectCleanupStatus`, `objectCleanupErrorCode`, and `objectCleanupErrorMessage`.
- [x] `ingestion_jobs.status` includes `pending_source`, and reserved upload jobs use it before the source object is available.
- [x] Active-source duplicate prevention is enforced at the database level for `tenant_id + knowledge_base_id + source_type + source_hash` where upload status is `pending_upload` or `available`.
- [x] Upload size limit defaults to 8 MiB and is configurable through validated runtime configuration.
- [x] Upload route rate limit defaults to `20` attempts per authenticated actor per minute and is configurable.
- [x] Upload concurrency limits default to `2` per actor and `10` per tenant and are configurable.

### Upload API Contract

- [x] A valid authenticated multipart upload accepts exactly one file part and optional `title`.
- [x] Missing or blank `title` uses the original filename without extension.
- [x] Multipart requests with zero files or more than one file part fail validation.
- [x] Uploads with missing, invalid, non-positive, or over-limit `Content-Length` fail before multipart parsing.
- [x] Uploads whose actual file bytes exceed the configured file-size limit fail even if `Content-Length` was acceptable.
- [x] Only PDF, Markdown, and TXT files are accepted.
- [x] Unsupported file types such as DOCX, XLSX, CSV, PPTX, or HTML file upload fail with a clear public error.
- [x] Files with spoofed MIME type or extension fail when lightweight file signature checks do not match.
- [x] Object keys are server-generated and include tenant, knowledge base, document, version, and source context.

### Authorization, Rate Limit, and Concurrency

- [x] A valid upload by an `admin` succeeds for any knowledge base in the actor's tenant.
- [x] A valid upload by a `member` succeeds only for a knowledge base where the member is authorized.
- [x] Upload to a missing or cross-tenant knowledge base fails without creating DB rows or objects.
- [x] Unauthenticated or failed-auth upload requests are rejected before file parsing, checksum calculation, database mutation, or object storage upload.
- [x] Authenticated actor upload rate limiting is enforced and tested at `20` attempts per minute.
- [x] Concurrent upload limits are enforced and tested at `2` per actor and `10` per tenant.

### Persistence and State Flow

- [x] New uploads first reserve `documents`, `document_sources`, and `ingestion_jobs` metadata with `document_sources.uploadStatus = "pending_upload"` and `ingestion_jobs.status = "pending_source"`.
- [x] Reserved uploads are not visible as usable documents and are not processable ingestion jobs.
- [x] Object upload success marks the source `uploadStatus = "available"`, `scanStatus = "not_scanned"`, sets `uploadedAt`, and changes the ingestion job to `queued`.
- [x] The final availability update, ingestion job `queued` transition, and `document.uploaded` audit write are committed in one DB transaction before the API returns success.
- [x] Object upload failure retains failed metadata records with `uploadStatus = "upload_failed"` and `ingestion_jobs.status = "failed"` in a deterministic, tested way.
- [x] If object upload succeeds but the final DB transaction fails, the API does not return success, attempts best-effort object deletion, and marks the reserved source/job failed with a safe failure reason.
- [x] If that best-effort object deletion fails, the source/job remain failed and unavailable, `objectCleanupStatus = "cleanup_failed"` is persisted with a safe cleanup reason, and `document.upload_cleanup_failed` audit is written when the database is available.
- [x] Failed upload records are not exposed as usable documents, active duplicate blockers, usable sources, or processable jobs.
- [x] Successful upload creates the document/source/job metadata and does not enqueue BullMQ.

### Duplicate and Idempotency Behavior

- [x] Duplicate-content behavior is based on checksum, deterministic, tested, and cannot be bypassed by renaming the file or changing `title`.
- [x] Re-uploading the same file content to the same knowledge base returns the existing document/job summary and does not create new records or objects.
- [x] Duplicate-content uploads write a `document.duplicate_upload_ignored` audit record.
- [x] Repeated-click or retry behavior is deterministic, tested, and does not create duplicate document/source/job rows.
- [x] Failed uploads with `objectCleanupStatus = "cleanup_failed"` do not block checksum-based retry or duplicate handling for a later successful upload.

### Audit and Verification

- [x] Successful new uploads write a `document.uploaded` audit record with safe metadata.
- [x] Security-sensitive upload failures write safe audit records where actor context is available.
- [x] Orphaned-object cleanup failures write `document.upload_cleanup_failed` audit records with safe metadata when the database is available.
- [x] Audit metadata does not include raw file content, full object credentials, database URLs, or complete document text.
- [x] Relevant unit/API tests cover schema states, validation, authorization, duplicate/idempotency behavior, rate limits, concurrency limits, audit behavior, and upload success/failure state transitions.
- [x] Typecheck, lint, and relevant tests pass for touched packages/apps.

## Definition of Done

- Tests added/updated for unit and API-level behavior where appropriate.
- Typecheck, lint, and relevant test commands pass.
- Env examples and README/config notes updated if a new config variable is introduced.
- No frontend mock replacement is included in this task.
- No URL ingestion, parser, worker, embedding, or indexing work is included in this task.

## Out of Scope

- Frontend upload UI or replacing document mock data.
- URL ingestion.
- BullMQ enqueueing or worker execution.
- Document parsing, normalization, chunking, embedding, Meilisearch indexing, or pgvector writes.
- Download APIs or signed URLs.
- Deletion/cleanup workflows beyond local compensation needed for failed upload save operations.
- Support for DOCX, XLSX, CSV, PPTX, or arbitrary HTML file uploads.

## Technical Notes

- Relevant existing files:
  - `src/apps/api/src/app.ts`
  - `src/apps/api/src/runtime-services.ts`
  - `src/apps/api/src/contracts/services.ts`
  - `src/apps/api/src/session-guards.ts`
  - `src/apps/api/src/request-helpers.ts`
  - `src/packages/config/src/index.ts`
  - `src/packages/storage/src/index.ts`
  - `src/packages/db/src/schema/knowledge.ts`
  - `src/packages/db/src/schema/ingestion.ts`
- Relevant specs:
  - `.trellis/spec/backend/api-contract.md`
  - `.trellis/spec/backend/storage.md`
  - `.trellis/spec/backend/security.md`
  - `.trellis/spec/backend/rag-ingestion.md`
  - `.trellis/spec/backend/package-boundaries.md`
- Existing storage helper should likely be updated or extended to match the storage spec key format:
  `tenants/{tenantId}/knowledge-bases/{knowledgeBaseId}/documents/{documentId}/versions/{documentVersion}/source/{filename}`.
- The implementation should define a testable storage service boundary so API/domain tests can use an in-memory fake instead of requiring MinIO.
