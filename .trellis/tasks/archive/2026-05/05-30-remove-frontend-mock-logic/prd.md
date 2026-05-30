# Remove Frontend Mock Logic

## Goal

Remove all frontend mock data logic from the web app so the UI no longer depends on local demo state, mock reducers, mock selectors, mock route wrappers, mock-only contracts, or mock-backed pages. Pages that already use real API hooks should keep their real implementation. Pages/routes that exist only for mock-backed task, log, document, or demo data workflows should be deleted rather than preserved as placeholders.

## What I Already Know

- The task was explicitly requested as a Trellis task.
- The repo is a pnpm TypeScript monorepo; `src/apps/web` is a Next.js 16 App Router app.
- Frontend mock data is centralized under `src/apps/web/src/features/mock/`:
  - `mock-data-boundary.tsx`
  - `seed.ts`
  - `selectors.ts`
  - `store.tsx`
  - `store.test.ts`
  - `types.ts`
- `/tasks` and `/logs` still wrap `AdminListPage` with `MockDataBoundary`, even though `AdminListPage` now renders placeholder copy for those page kinds.
- `src/apps/web/src/features/documents/documents-page.tsx` and `document-detail-page.tsx` directly consume `useMockStore`, mock selectors, and mock types.
- Several helper/test files still import mock types or seed state:
  - `src/apps/web/src/features/admin/admin-list-helpers.ts`
  - `src/apps/web/src/features/admin/admin-list-page.test.ts`
  - `src/apps/web/src/features/workspace/workspace-layout.ts`
  - `src/apps/web/src/features/workspace/workspace-layout.test.ts`
  - `src/apps/web/src/features/workspace/workspace-permissions.ts`
  - `src/apps/web/src/features/workspace/workspace-permissions.test.ts`
  - `src/apps/web/src/features/documents/document-detail-permissions.ts`
  - `src/apps/web/src/features/documents/document-detail-permissions.test.ts`
- Existing contract tests already assert that the workspace and chat routes do not import mock store.
- `commonCopy` still contains demo/mock UI copy such as `mockNotice`, `resetDemoData`, `roleSwitcher`, and `demoRecovered`.

## Assumptions

- "Frontend mock logic" means browser-side demo state, reducer actions, seed data, selectors, mock-only types, mock wrappers, and tests whose only purpose is validating that mock behavior.
- Backend/unit-test mocks such as Vitest mocks, service fakes, and test doubles are not in scope.
- Placeholder text that says data is pending real API integration is acceptable only where the page already has a non-mock real shell that should remain; mock-backed routes/pages should be deleted outright.
- Real API-backed features must not regress: auth/session, workspace knowledge-base management, file upload, chat, provider config, and users should continue to use their existing hooks/contracts.

## Requirements

- Delete `src/apps/web/src/features/mock/` and remove all imports from it.
- Remove `MockDataBoundary` from routes and ensure no route imports it.
- Delete mock-store-backed document list/detail UI and its app routes/loaders.
- Delete task/log app routes and loading screens if they exist only to expose mock-backed workflows.
- Remove mock-dependent admin helper code and tests that no longer back rendered UI.
- Remove mock-specific workspace/document helper exports or retarget them to real shared types where still useful.
- Remove demo/mock copy from `commonCopy` when no longer referenced.
- Keep existing real API-backed pages working:
  - `/workspace`
  - `/chat`
  - `/providers`
  - `/users`
  - `/audit` admin shell only if it remains non-mock-backed
- Update or delete tests so no frontend test imports `features/mock`.
- Add or preserve contract coverage that verifies web app source has no frontend mock module imports.

## Acceptance Criteria

- [x] `rg "features/mock|../mock|useMockStore|MockDataBoundary|mockStoreReducer|createSeedMockState|MOCK_STORAGE_KEY" src/apps/web/src` returns no production references, except allowed text in tests that assert absence if those tests remain useful.
- [x] `src/apps/web/src/features/mock/` no longer exists.
- [x] Mock-backed app routes for `/documents`, `/documents/[documentId]`, `/tasks`, and `/logs` are deleted.
- [x] Navigation no longer links to deleted mock-backed routes.
- [x] TypeScript passes for `@kb/web`.
- [x] Relevant web tests pass after removing mock-only tests.
- [x] No real API-backed frontend workflow is replaced with fake local data.

## Verification

- `pnpm --filter @kb/web test`
- `pnpm --filter @kb/web typecheck`
- `pnpm --filter @kb/web lint`
- `pnpm --filter @kb/web build`
- `git diff --check`

## Out of Scope

- Implementing real task/log/document list APIs or replacement pages for deleted mock-backed routes.
- Removing Vitest `vi.mock` usage or backend test fakes.
- Changing backend contracts, DB schema, ingestion behavior, or API route behavior unless required by frontend type cleanup.
- Reworking navigation beyond removing links that would otherwise point only to deleted mock-only UI.

## Technical Notes

- Relevant specs:
  - `.trellis/spec/frontend/index.md`
  - `.trellis/spec/shared/index.md`
  - `.trellis/spec/testing/index.md`
  - `.trellis/spec/guides/index.md`
- Useful validation commands:
  - `pnpm --filter @kb/web typecheck`
  - `pnpm --filter @kb/web test`
  - `pnpm --filter @kb/web lint`
- Current likely affected areas:
  - `src/apps/web/src/features/mock/*`
  - `src/apps/web/src/app/tasks/*`
  - `src/apps/web/src/app/logs/*`
  - `src/apps/web/src/app/documents/*`
  - `src/apps/web/src/features/documents/*`
  - `src/apps/web/src/features/admin/admin-list-helpers.ts`
  - `src/apps/web/src/features/admin/admin-list-page.test.ts`
  - `src/apps/web/src/features/workspace/workspace-layout.ts`
  - `src/apps/web/src/features/workspace/workspace-permissions.ts`
  - `src/apps/web/src/features/documents/document-detail-permissions.ts`
  - `src/apps/web/src/copy/common.ts`
