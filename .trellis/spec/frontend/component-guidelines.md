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

## Semantic HTML and Accessibility

Use proper elements:

- `<button type="button">` for actions.
- `<a>` or Next.js `Link` for navigation.
- `<label>` with `htmlFor` for form controls.
- `aria-describedby` for field errors.
- `role="alert"` for validation messages that should be announced.

Do not use clickable `<div>` or `<span>` elements for actions.

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

