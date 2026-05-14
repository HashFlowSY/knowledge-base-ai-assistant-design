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
- [ ] Clickable actions use `<button>`, not `<div>`.
- [ ] Forms have labels and accessible error messages.
- [ ] `next/image` is used for images.
- [ ] Loading, empty, and error states are handled.

## State and API

- [ ] Server state uses TanStack Query in client components.
- [ ] List pagination, search, sort, and filters are reflected in URL state.
- [ ] Mutations invalidate or update affected queries.
- [ ] Internal API calls use the project API client/RPC contract.
- [ ] Raw `fetch` is not used for internal APIs unless explicitly justified.

## Layout

- [ ] Scrollable flex children use `min-h-0` where needed.
- [ ] Touch targets are at least `44px` by `44px`.
- [ ] Responsive breakpoints were checked for changed views.
- [ ] Text does not overflow controls or cards.

## Commands

Run applicable checks:

- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`
- Relevant Playwright or component tests when user-facing behavior changes

If a listed script has not been scaffolded yet, mark the frontend quality gate as
blocked or add the script. A missing script is not a successful check.
