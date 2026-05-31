# Component Guidelines

## Server and Client Components

Use Server Components by default.

Good Server Component responsibilities:

- Fetch initial data for non-interactive views.
- Read server-only configuration.
- Keep sensitive operations off the client.
- Render static or mostly static layout.

Use Client Components only when needed:

- Event handlers such as `onClick` or `onChange`.
- React hooks such as `useState`, `useEffect`, `useQuery`, or `useMutation`.
- Browser APIs such as `window`, `document`, or local storage.

Push Client Components down the tree. A page can fetch data on the server and pass serializable initial props to a smaller interactive child.

## Serialization Boundary

Props passed from Server Components to Client Components must be serializable.

Allowed:

- `string`
- `number`
- `boolean`
- `null`
- plain objects and arrays

Avoid crossing the boundary with:

- `Date`
- `Map`
- `Set`
- functions
- class instances
- `BigInt`

Convert dates to ISO strings before passing them to client components.

## Shared UI Component System

Shared UI component imports, shadcn configuration, project wrappers, token usage,
and migration contracts are defined in
[component-development.md](./component-development.md).

Feature code should import shared controls from `@/components/ui/*`. Do not add
new `src/apps/web/src/features/ui/*` modules or `../ui/*` imports.

Business components must not import `radix-ui` directly. Radix primitives are
wrapped by `src/apps/web/src/components/ui/*`.

## Semantic HTML and Accessibility

These rules describe rendered HTML semantics. Feature and business components
must use `Button` or `ButtonLink` from `@/components/ui/button` for styled
actions. Do not write raw styled `<button>` elements to bypass the shadcn/ui
project wrappers.

Use proper rendered elements:

- `Button` renders `<button type="button">` for non-submit actions.
- `Button type="submit"` renders submit actions.
- `<a>`, Next.js `Link`, or `ButtonLink` renders navigation.
- `<label>` with `htmlFor` for form controls.
- `aria-describedby` for field errors.
- `role="alert"` for validation messages that should be announced.

Do not use clickable `<div>` or `<span>` elements for actions.

## Feedback and Dialogs

Use the global shadcn/ui Sonner `Toaster` for non-blocking success feedback
after mutations. Do not render success confirmations as inline `Notice`/`Alert`
blocks inside list panels or page content.

Reserve inline `Notice`/`Alert` blocks for contextual states that need to occupy
the page or dialog area: loading, empty, error, forbidden, validation, and retry
states.

Dialog wrappers must keep close controls accessible and localized to the
application language. Dialog content should be constrained to the viewport and
scroll internally when form content grows, so close controls and submit actions
remain reachable.

### Form Submit Handler Types

Do not import or annotate handlers with React's `FormEvent` type. For form
submit handlers, use the frontend shared handler type:

```tsx
import type { FormSubmitHandler } from "@/lib/form-types";

const handleSubmit: FormSubmitHandler = (event) => {
  event.preventDefault();
};
```

This keeps handler signatures aligned with React's `<form onSubmit>` contract
without direct `FormEvent` references.

## Images

Use `next/image` instead of raw `<img>` tags.

Provide:

- Meaningful `alt` text.
- Stable dimensions or `fill` with a positioned parent.
- `priority` only for above-the-fold critical images.

## Layout

For full-height layouts, use default stretch behavior instead of centering the main flex axis accidentally.

```tsx
<div className="flex h-screen">
  <aside className="w-64 shrink-0" />
  <main className="min-h-0 flex-1 overflow-y-auto" />
</div>
```

Use `min-h-0` on flex children that contain scrollable content.

Parent components own external placement and spacing. Child components own internal padding, typography, borders, and layout.

## Touch Targets

Interactive targets should be at least `44px` by `44px` on touch devices.

Use `-webkit-tap-highlight-color: transparent` for custom mobile controls when needed.
