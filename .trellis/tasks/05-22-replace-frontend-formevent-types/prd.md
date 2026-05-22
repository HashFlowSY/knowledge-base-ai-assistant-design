# Replace Deprecated Frontend FormEvent Types

## Goal

Remove direct usage of React's `FormEvent` type from frontend code and replace it with a suitable, type-safe alternative that preserves existing form submit behavior.

## What I Already Know

- The request is limited to frontend code.
- `FormEvent` is currently treated as deprecated for this codebase and should no longer be imported or referenced directly.
- Current matches are all form submit handlers or submit callback props in `src/apps/web`.
- Existing handlers call `event.preventDefault()` and then run local validation, mutations, mock-store dispatches, or navigation.

Current `FormEvent` references found by `rg -n "\bFormEvent\b" .`:

- `src/apps/web/src/features/workspace/workspace-mvp-page.tsx`
  - import from React
  - three `handleSubmit(event: FormEvent<HTMLFormElement>)` handlers
- `src/apps/web/src/features/admin/user-dialog.tsx`
  - import from React
  - one async submit handler
- `src/apps/web/src/features/admin/provider-config-dialog.tsx`
  - import from React
  - one submit handler
- `src/apps/web/src/features/auth/login-page.tsx`
  - import from React
  - one async submit handler
- `src/apps/web/src/features/chat/chat-page.tsx`
  - import from React
  - one submit handler
- `src/apps/web/src/features/ui/dialog.tsx`
  - import from React
  - `DialogFrame` `onSubmit` prop type

## Assumptions

- This is a type-only refactor; runtime behavior should not change.
- Submit handlers should remain compatible with React form `onSubmit`.
- The replacement should avoid introducing broader or less precise event types.
- A local type alias is acceptable if it removes deprecated direct usage and improves consistency.

## Recommended Approach

Use React's form prop type as the source of truth for submit handlers instead of directly importing `FormEvent`.

Suggested pattern:

```ts
import type { ComponentPropsWithoutRef } from "react";

type FormSubmitHandler = NonNullable<ComponentPropsWithoutRef<"form">["onSubmit"]>;
```

Then use:

```ts
const handleSubmit: FormSubmitHandler = (event) => {
  event.preventDefault();
};
```

This keeps the type aligned with React's actual `<form onSubmit>` contract without referencing `FormEvent` in application code.

## Alternatives Considered

- `SubmitEvent`: rejected because React `onSubmit` handlers receive React synthetic events, not native DOM submit events directly.
- `React.ComponentProps<"form">["onSubmit"]` inline everywhere: valid, but noisier and more repetitive than a small shared alias.
- Loosen to `(event: { preventDefault(): void }) => void`: rejected because it throws away useful form-event typing and weakens type safety.

## Requirements

- Remove all direct `FormEvent` imports from frontend code.
- Remove all direct `FormEvent<...>` references from frontend code.
- Keep every existing submit handler behavior unchanged.
- Keep `DialogFrame` `onSubmit` compatible with `<form onSubmit={...}>`.
- Prefer a reusable frontend-local submit handler type over duplicated inline type expressions if it fits existing structure.
- Do not change UI copy, form validation rules, routing, mock data behavior, or mutation behavior.

## Acceptance Criteria

- [ ] `rg -n "\bFormEvent\b" src/apps/web` returns no matches.
- [ ] TypeScript accepts all updated form submit handlers.
- [ ] Existing form submit flows still call `preventDefault()`.
- [ ] Existing lint/type-check commands pass.
- [ ] No unrelated source files are changed.

## Definition of Done

- Tests added or updated if an existing test covers these form submit paths.
- Lint and type-check pass.
- No direct `FormEvent` references remain under `src/apps/web`.
- Any new helper type follows frontend spec conventions and stays close to UI/form code.

## Out of Scope

- Refactoring form state management.
- Changing validation UX or copy.
- Replacing React synthetic event semantics with native DOM events.
- Updating backend or shared package code unless required by type-check.
- Touching unrelated dirty worktree changes.

## Technical Notes

- Project frontend stack from `.trellis/spec/frontend/index.md`: Next.js 16 App Router, React 19.2, TypeScript strict, Tailwind CSS, shadcn/ui.
- Relevant frontend spec index: `.trellis/spec/frontend/index.md`.
- Existing unrecognized dirty file before this task: `src/apps/web/src/features/ui/button.tsx`. Do not modify or include it unless explicitly requested.
