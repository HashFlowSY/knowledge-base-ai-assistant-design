# Record Frontend API State Migration Verification

## Goal

Record the accepted frontend state-management verification rules so future backend API integration work can prove that the current mock-store page-state issues have been resolved.

## What I already know

- The current frontend MVP uses `src/apps/web/src/features/mock/*` as a frontend-only demo state boundary.
- The project frontend spec already says real API server state must use TanStack Query rather than React Context.
- The user confirmed that backend integration should eventually delete all mock-data-related logic.
- The user reviewed and approved adding concrete verification rules to frontend specs.

## Requirements

- Add a backend API integration verification section to `.trellis/spec/frontend/state-management.md`.
- Add frontend quality checklist items to `.trellis/spec/frontend/quality-guidelines.md`.
- Keep the update focused on executable, testable guidance for future backend/frontend integration.
- Do not change application runtime code in this task.

## Acceptance Criteria

- [x] The state-management spec defines when mock store usage is no longer allowed.
- [x] The state-management spec defines production state, list/URL, auth/permission, mutation, and test contracts.
- [x] The quality checklist includes checks for mock-store removal and API-state ownership.
- [x] The resulting diff is limited to Trellis task/spec documentation.

## Out of Scope

- Implementing backend APIs.
- Migrating current pages from mock data to backend APIs.
- Removing `src/apps/web/src/features/mock/*`.
- Adding automated tests in application code.

## Technical Notes

- Target files:
  - `.trellis/spec/frontend/state-management.md`
  - `.trellis/spec/frontend/quality-guidelines.md`
