# frontend: integrate backend file upload API

## Goal

Connect the workspace file-upload entry point to the real backend document upload API so users can upload one supported document file into the currently selected knowledge base and receive clear success/error feedback.

## What I Already Know

* User requested a Trellis task for integrating the backend file upload API.
* Existing backend route is `POST /api/knowledge-bases/:knowledgeBaseId/documents/upload`.
* Backend expects `multipart/form-data` with exactly one file part and an optional `title` text field.
* Backend validates authentication, CSRF/origin for mutation requests, upload rate/concurrency limits, `Content-Length`, file size, supported file types, and lightweight file signatures.
* Supported upload file types are PDF, Markdown, and TXT. The backend currently reports unsupported types as `415`.
* Backend response schema is `documentFileUploadResultSchema` from `@kb/knowledge`.
* `ApiApp` already exposes the upload route in the Hono RPC schema.
* Frontend API utilities already use the typed Hono client and `parseApiClientResponse`.
* The workspace page already has a disabled `上传文件` button and copy saying file upload will be opened after real document API integration.
* Workspace state already uses TanStack Query hooks for real knowledge-base list/detail data, not the mock store.

## Assumptions (Temporary)

* On successful upload, the UI should invalidate the affected knowledge-base queries so document counts can refresh.
* Upload progress percentage is out of scope unless explicitly required; pending/disabled submit state is enough for MVP.
* Frontend upload size validation should use the backend default max of 8 MB unless a runtime config endpoint exists before implementation.

## Open Questions

* None. User confirmed the MVP scope.

## Requirements (Evolving)

* Use the existing workspace `上传文件` button as the MVP entry point.
* Open a modal/dialog for upload from the workspace page when a knowledge base is selected.
* Add a frontend mutation hook for uploading a document file through the typed API/RPC client.
* Enable the workspace upload action when a knowledge base is selected.
* Collect one file and an optional document title from the user.
* If the title is blank, rely on the backend filename fallback behavior.
* Add sufficient frontend validation before submit:
  * require a selected file;
  * allow exactly one file;
  * reject empty files;
  * reject files larger than 8 MB;
  * allow only PDF, Markdown, or TXT by extension and MIME type;
  * validate optional title after trimming, with a 500-character maximum;
  * show centralized Chinese validation copy near the upload form.
* Treat frontend validation as a usability layer only; backend validation remains authoritative.
* Submit `multipart/form-data` without manually forcing a JSON `content-type`.
* Parse the API response with `documentFileUploadResultSchema`.
* Close the upload dialog after a successful upload.
* Show success copy based on backend response data:
  * when `duplicate` is `false`, mention the uploaded document title and that processing has been queued when the returned job status is `queued`;
  * when `duplicate` is `true`, mention that identical content already exists and include the returned document title.
* Map known API error codes to centralized Chinese upload failure copy instead of exposing raw backend messages.
* Include mappings at least for `PAYLOAD_TOO_LARGE`, `UNSUPPORTED_MEDIA_TYPE`, `VALIDATION_ERROR`, `RATE_LIMITED`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, and a generic fallback.
* Show concise Chinese success and error copy from centralized knowledge copy.
* Invalidate affected knowledge-base list/detail queries after upload succeeds.

## Acceptance Criteria (Evolving)

* [ ] A user with a selected knowledge base can open an upload UI from the workspace page.
* [ ] The upload UI accepts one PDF, Markdown, or TXT file and shows an optional title field.
* [ ] Frontend validation blocks missing, empty, oversized, unsupported-type, and overlong-title submissions before API calls.
* [ ] Submitting calls `POST /api/knowledge-bases/:knowledgeBaseId/documents/upload` with `FormData`.
* [ ] Successful new upload closes the dialog, shows a document-title-aware queued success notice, and refreshes relevant knowledge-base queries.
* [ ] Duplicate upload closes the dialog and shows a duplicate-aware success notice using the returned document title.
* [ ] Frontend validation and API errors are shown through error-code-based Chinese copy without raw technical details.
* [ ] Relevant frontend tests cover the hook contract and workspace upload UI behavior.

## Definition of Done (Team Quality Bar)

* Tests added/updated for the hook and workspace behavior where appropriate.
* `pnpm --filter @kb/web lint` passes.
* `pnpm --filter @kb/web typecheck` passes.
* Docs/notes updated if behavior changes.
* Rollout/rollback considered if risky.

## Out of Scope (Explicit)

* Backend upload route changes.
* Multi-file upload.
* Drag-and-drop upload.
* Upload progress percentage.
* Upload preview.
* Upload success navigation to document detail.
* Full document list/detail API integration beyond refreshing existing knowledge-base data.
* URL import.

## Technical Notes

* Backend upload procedure: `src/apps/api/src/modules/documents/procedures/upload-document-file.ts`
* Backend router: `src/apps/api/src/modules/documents/router.ts`
* Backend contract tests: `src/apps/api/src/document-upload.test.ts`
* Shared result schema: `src/packages/knowledge/src/schemas.ts`
* Frontend API client: `src/apps/web/src/features/api/client.ts`
* Frontend knowledge hooks: `src/apps/web/src/features/knowledge/knowledge-hooks.ts`
* Workspace page: `src/apps/web/src/features/workspace/workspace-mvp-page.tsx`
* Centralized Chinese copy: `src/apps/web/src/copy/knowledge.ts`
* Relevant specs: `.trellis/spec/frontend/index.md`, `.trellis/spec/frontend/hook-guidelines.md`, `.trellis/spec/frontend/state-management.md`, `.trellis/spec/frontend/component-guidelines.md`, `.trellis/spec/frontend/copywriting.md`, `.trellis/spec/shared/index.md`, `.trellis/spec/testing/index.md`

## Decision (ADR-lite)

**Context**: The workspace already has a disabled upload entry point and the backend upload route is available with a typed response schema.

**Decision**: Implement the MVP as a workspace modal upload flow with one file, optional title, strong frontend validation, typed multipart API mutation, success notices derived from backend response fields, and error notices derived from API error codes.

**Consequences**: This keeps the first integration focused and testable while leaving drag-and-drop, progress percentages, upload previews, document navigation, URL import, and multi-file upload for later tasks.
