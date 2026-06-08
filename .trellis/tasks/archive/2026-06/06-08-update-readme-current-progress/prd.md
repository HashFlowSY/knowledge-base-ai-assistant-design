# Update README for current progress

## Goal

Update the root `README.md` so it reflects the repository's current implemented state after the latest document-processing and ingestion repository work.

## Requirements

- Refresh the opening progress summary to include the document-processing list/retry API and UI that are now implemented.
- Keep the README aligned with the current monorepo structure and package names.
- Update the architecture and directory sections if they reference stale ingestion repository organization.
- Update startup and manual verification guidance only where the existing instructions are stale.
- Update the current-progress section so completed document-processing features are no longer listed as pending.
- Preserve the README's current Chinese documentation style and avoid expanding scope into unrelated product docs.

## Acceptance Criteria

- [x] `README.md` mentions document-processing status visibility and retry support as implemented.
- [x] Remaining TODOs distinguish document browsing/audit/log pages from the implemented processing status list.
- [x] Ingestion repository split is reflected as a maintainability/code-organization improvement where relevant.
- [x] No generated folders, dependency caches, or local build artifacts are documented as source structure.
- [x] Markdown renders cleanly and avoids stale claims found during repo inspection.

## Definition Of Done

- `README.md` updated.
- Markdown inspected for obvious formatting issues.
- `git diff --check` passes.

## Out Of Scope

- Application behavior changes.
- New tests beyond documentation verification.
- New product or deployment documentation not already represented in README.
- Archiving or committing the task unless requested separately.

## Technical Notes

- Current task: `.trellis/tasks/06-08-update-readme-current-progress`.
- Recent commits inspected:
  - `682893c feat:添加文档处理进度显示逻辑`
  - `25a8a10 refactor(ingestion): 拆分 drizzle repository`
- Relevant implemented files include:
  - `src/apps/api/src/modules/documents/procedures/list-document-processing.ts`
  - `src/apps/api/src/modules/documents/procedures/retry-document-processing.ts`
  - `src/apps/web/src/features/knowledge/document-processing-list.tsx`
  - `src/packages/knowledge/src/operations/document-processing/list.ts`
  - `src/packages/knowledge/src/operations/document-processing/retry.ts`
  - `src/packages/ingestion/src/repositories/drizzle-ingestion-repository.ts`

## Spec Update Review

- No `.trellis/spec/` update is needed for this task.
- Reason: the change only updates README/project-task documentation to match already implemented behavior; it does not introduce or change executable contracts, API signatures, database schema, commands, runtime configuration, or coding conventions.
