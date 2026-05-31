# Frontend Quality Checklist

Before completing frontend work, verify:

## Type Safety

- [ ] No `any` types added.
- [ ] No non-null assertions added.
- [ ] No `@ts-ignore` or `@ts-expect-error` comments added.
- [ ] API response types are imported or inferred from the owner package.
- [ ] TanStack Query cache updates are typed.

## Components

- [ ] Server Components are used by default.
- [ ] `"use client"` appears only where interactivity, hooks, or browser APIs require it.
- [ ] Styled clickable actions use `Button` or `ButtonLink` from
  `@/components/ui/button`.
- [ ] Rendered actions are semantic `<button>` or link elements, not clickable
  `<div>` or `<span>`.
- [ ] Forms have labels and accessible error messages.
- [ ] `next/image` is used for images.
- [ ] Loading, empty, and error states are handled.

## shadcn/ui Component Contract

- [ ] New shared UI imports use `@/components/ui/*`.
- [ ] No new `src/apps/web/src/features/ui/*` modules were added.
- [ ] Business code does not import `../ui/*`.
- [ ] Business code does not import `radix-ui` directly.
- [ ] `src/apps/web/src/components/ui/*` contains no API calls, query hooks,
  auth/session logic, domain entity types, feature copy imports, or
  page-specific data fetching.
- [ ] Feature UI and project-authored wrapper styles use semantic tokens instead
  of new hard-coded `slate`, `teal`, `red`, `blue`, `yellow`, `white`, or
  `black` visual classes.
- [ ] Dialog, sheet, alert-dialog, and icon-only button screen-reader labels are
  Chinese.
- [ ] Successful mutation feedback uses `toast.success(...)` rather than inline
  `<Notice tone="success">`.

## State and API

- [ ] Server state uses TanStack Query in client components.
- [ ] Backend-integrated production pages do not import
  `src/apps/web/src/features/mock/*`.
- [ ] Backend-integrated production pages do not use `useMockStore`,
  `MockStoreProvider`, `MockState`, `MockAction`, or `Mock*` business entity
  types.
- [ ] API data is not stored in React Context or persisted to `localStorage`.
- [ ] List pagination, search, sort, and filters are reflected in URL state.
- [ ] List query keys include every URL/input value that affects the API
  response.
- [ ] Frontend filtering/sorting/pagination does not replace API-owned list
  semantics for server collections.
- [ ] Mutations invalidate or update affected queries.
- [ ] Internal API calls use the project API client/RPC contract.
- [ ] Raw `fetch` is not used for internal APIs unless explicitly justified.
- [ ] Auth/session/permission behavior comes from the auth layer or API
  responses, not mock session flags.

## Layout

- [ ] Scrollable flex children use `min-h-0` where needed.
- [ ] Touch targets are at least `44px` by `44px`.
- [ ] Responsive breakpoints were checked for changed views.
- [ ] Text does not overflow controls or cards.

## Commands

Run applicable checks:

- `pnpm --filter @kb/web lint`
- `pnpm --filter @kb/web typecheck`
- `pnpm --filter @kb/web test`
- `pnpm --filter @kb/web build`
- Relevant Playwright or component tests when user-facing behavior changes

If a listed script has not been scaffolded yet, mark the frontend quality gate as
blocked or add the script. A missing script is not a successful check.

## Next App Router Route Removal

When deleting or disabling an App Router `page.tsx`, rerun type-check after
clearing stale generated Next metadata if the failure references a deleted route
from `.next/types/validator.ts`.

```bash
rm -rf src/apps/web/.next
pnpm --filter @kb/web typecheck
```

The source of truth is the route files under `src/apps/web/src/app`; `.next/` is
ignored generated output and can retain validators for routes that no longer
exist.

## PRD Drift Checks

When frontend implementation intentionally narrows or revises a PRD decision,
add an executable contract test that reads the relevant task PRD and asserts the
new accepted wording is present while superseded terms are absent.

Keep the contract wording in the same narrative language as the task PRD. For
the current frontend PRD, accepted PRD contract phrases should be English;
Chinese belongs in UI copy examples and required product strings, not in new
English-PRD requirement bullets.

Use this for scope changes that future work could accidentally revert, such as:

- Removing invite flows from user management in favor of CRUD.
- Limiting model service configuration to fixed `chat`, `embedding`, and
  `rerank` configs.
- Removing deprecated actions such as default-provider selection or standalone
  key rotation from the current frontend scope.

These tests do not replace product review. They keep implementation-driving PRD
text aligned with the accepted frontend behavior before future agents continue
from the document.
