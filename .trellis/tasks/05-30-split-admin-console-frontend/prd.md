# Split Admin Console Frontend

## Goal

Split the oversized Admin console frontend page into focused, maintainable components without changing user-visible behavior, API contracts, route entry points, or existing admin workflows.

## What I already know

* User explicitly requested a Trellis task and wants the Admin console frontend split completed.
* User requested the impact scope be confirmed again before implementation.
* The oversized file is `src/apps/web/src/features/admin/admin-list-page.tsx` at 465 lines.
* Route entry points import `AdminListPage` from `src/apps/web/src/features/admin/admin-list-page.tsx`:
  * `src/apps/web/src/app/users/page.tsx`
  * `src/apps/web/src/app/providers/page.tsx`
  * `src/apps/web/src/app/tasks/page.tsx`
  * `src/apps/web/src/app/logs/page.tsx`
  * `src/apps/web/src/app/audit/page.tsx`
* Existing Admin UI already uses shared UI components:
  * `Button` / `ButtonLink`
  * `Panel` / `PanelHeader`
  * `Drawer`
  * `Notice`
  * `ScrollArea`
  * `SelectField`
  * `DialogFrame`
* Existing feature-local Admin modules already exist and should be reused rather than duplicated:
  * `admin-list-layout.ts`
  * `admin-pagination.tsx`
  * `provider-config-dialog.tsx`
  * `provider-hooks.ts`
  * `provider-page-view.ts`
  * `user-dialog.tsx`
  * `user-hooks.ts`
  * `user-ui-helpers.ts`
* Frontend specs require TypeScript strict, semantic HTML, accessible UI, URL query params for list state, TanStack Query for server state, and shared UI primitives before custom controls.

## Confirmed Impact Range

### In Scope

* Split `src/apps/web/src/features/admin/admin-list-page.tsx` into smaller Admin feature components.
* Keep `AdminListPage` exported from `admin-list-page.tsx` so all existing route imports keep working.
* Preserve current behavior for:
  * `providers` page model service list and edit dialog.
  * `users` page search/filter/sort/page URL state.
  * user detail drawer via `selectedId`.
  * create/edit user dialog.
  * remove-access confirmation modal.
  * placeholder notices for `tasks`, `logs`, and `audit`.
* Reuse shared UI components from `src/apps/web/src/features/ui` where possible.
* Keep existing hooks and API contract usage unchanged:
  * `useProviders`, `useSaveProviderConfig`
  * `useUsers`, `useRemoveUserAccess`
  * `useSessionQuery`
  * `listUsersQuerySchema`
* Add or update focused tests only where needed to protect the split.

### Out of Scope

* No visual redesign.
* No API/backend changes.
* No route path changes.
* No behavior changes to provider config, user CRUD, pagination, auth, or permissions.
* No migration of the older mock helper file `admin-list-helpers.ts` unless required by failing tests.
* No new UI library or table state library.

## Requirements

* `admin-list-page.tsx` should become a small route-level dispatcher/orchestrator.
* Provider UI should be moved into focused files, likely:
  * `providers-page.tsx`
  * `provider-row.tsx`
* Users UI should be moved into focused files, likely:
  * `users-page.tsx`
  * `user-row.tsx`
  * `user-detail-drawer.tsx`
  * `confirm-remove-access-dialog.tsx`
* Shared small helpers should be moved only when they are genuinely shared by extracted modules:
  * `empty-users-page.ts`
  * `select-options.ts`
  * `admin-empty-state.tsx`
  * `provider-grid-class-name.ts`
* Components must stay consistent with current frontend guidelines:
  * Use existing shared UI components.
  * Preserve semantic buttons and labels.
  * Keep URL state in URL search params.
  * Avoid adding new custom primitive controls when an existing `features/ui` component fits.
* File splitting should avoid circular dependencies and broad re-export barrels unless they simplify existing imports.

## Acceptance Criteria

* [ ] `src/apps/web/src/features/admin/admin-list-page.tsx` is below 150 lines and still exports `AdminListPage` and `AdminPageKind`.
* [ ] Extracted components each have one clear responsibility and live under `src/apps/web/src/features/admin/`.
* [ ] Existing route pages compile without import changes.
* [ ] Admin provider and users workflows preserve current DOM semantics and copy.
* [ ] Existing shared UI components are reused; no duplicate button, drawer, notice, select, or panel primitives are introduced.
* [ ] Relevant tests pass for Admin feature and frontend type-check/lint commands pass.

## Definition of Done

* PRD reviewed/confirmed before implementation.
* Frontend guidelines loaded before coding.
* Code split implemented with minimal behavior surface change.
* Tests updated only if needed and relevant tests pass.
* Lint/type-check run and pass, or any blocker is documented.
* Spec update considered before finish.

## Technical Notes

* Frontend spec index: `.trellis/spec/frontend/index.md`
* Testing spec index: `.trellis/spec/testing/index.md`
* Main target file: `src/apps/web/src/features/admin/admin-list-page.tsx`
* Existing reusable UI directory: `src/apps/web/src/features/ui/`
* Current Admin feature directory already has several focused modules; new files should follow the same naming and import style.
