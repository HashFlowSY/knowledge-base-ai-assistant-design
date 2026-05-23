# 暂时去除文档页面

## Goal

Temporarily remove the standalone document page surface from the web app while removing the current seeded document mock data. Keep the underlying page components and upload/runtime paths recoverable for later work.

## What I Already Know

* User requested creating a task for temporarily removing the document page.
* The current web app has standalone document routes at `/documents` and `/documents/[documentId]`.
* The global navigation exposes `/documents` to both admin and member users.
* Chat citations and audit events can currently link to document detail pages.
* The workspace still contains document upload and document-count functionality; those should not be removed by this task.
* Existing mock seed data contains document rows, sources, chunks, citations, and related task/log/audit records tied to document IDs.
* User clarified that this should not be implemented via redirects.
* User clarified that corresponding page components may remain, but the routes should be deleted or commented out.

## Assumptions

* "Temporarily remove" means users should no longer see or land on standalone document list/detail routes.
* Existing document feature components can stay in the codebase so the page can be restored later.
* Removing the current mock data means clearing existing seeded document example data, not removing the ability for runtime actions to create new data where that is still part of another workflow.

## Requirements

* Remove the "文档" item from the authenticated global navigation for all roles.
* Disable the Next.js App Router entries for `/documents` and `/documents/[documentId]` by deleting or commenting out the route files, not by redirecting.
* Avoid in-app links that send users to removed document routes.
* Remove the current seeded document mock data and document-detail demo data from the app's initial mock state.
* Keep page component files under `features/documents` unless they become type/lint blockers.
* Keep document upload, knowledge-base summary, chat, tasks, logs, and audit pages otherwise intact.
* Keep the change frontend-only unless implementation reveals a route contract that must be updated.

## Acceptance Criteria

* [ ] Admin navigation no longer includes `/documents`.
* [ ] Member navigation no longer includes `/documents`.
* [ ] The App Router no longer registers active page modules for `/documents` or `/documents/[documentId]`.
* [ ] The implementation does not use redirect logic for removed document routes.
* [ ] Initial mock state no longer contains the previous seeded document examples.
* [ ] Chat citation UI does not expose a broken document detail link.
* [ ] Audit document targets do not produce a broken document detail link.
* [ ] Relevant frontend tests are updated and pass.

## Technical Approach

Use route deactivation plus mock-data cleanup:

* Keep existing document feature files in place.
* Remove `/documents` from `navigationItems`.
* Delete or comment the App Router page modules at `src/apps/web/src/app/documents/page.tsx` and `src/apps/web/src/app/documents/[documentId]/page.tsx` so Next.js no longer exposes those pages.
* Clean existing document-oriented seed data from `src/apps/web/src/features/mock/seed.ts`, including seeded documents, sources, chunks, citations, and related records that only exist to demonstrate the removed document pages.
* Update chat/audit helpers so they no longer create links to the removed document detail route.
* Update route skeleton/navigation tests to match the temporary product surface.

## Decision (ADR-lite)

**Context**: The standalone document page is not ready to stay in the product surface, and current seeded mock data makes the removed page look available.

**Decision**: Disable route registration rather than redirecting; keep the page components for later restoration; remove current seeded document examples and dead document-detail links.

**Consequences**: Stale direct visits to `/documents` should fall through to the app's normal missing-route behavior. Restoring the page later will require re-adding the route page files and seed/demo data if still needed.

## Out of Scope

* Removing backend document upload APIs or storage logic.
* Removing document database schema or domain contracts.
* Redesigning workspace document summaries.
* Deleting the existing document page components.
* Removing runtime upload behavior that creates new documents through the workspace workflow.

## Technical Notes

* Likely files:
  * `src/apps/web/src/features/shell/navigation.ts`
  * `src/apps/web/src/features/shell/navigation.test.ts`
  * `src/apps/web/src/app/documents/page.tsx`
  * `src/apps/web/src/app/documents/[documentId]/page.tsx`
  * `src/apps/web/src/features/chat/chat-page.tsx`
  * `src/apps/web/src/features/admin/admin-list-helpers.ts`
  * `src/apps/web/src/features/ui/skeleton-variants.ts`
  * `src/apps/web/src/features/mock/seed.ts`
  * `src/apps/web/src/features/mock/store.test.ts`
* Frontend spec index: `.trellis/spec/frontend/index.md`.
* Guide index: `.trellis/spec/guides/index.md`.
