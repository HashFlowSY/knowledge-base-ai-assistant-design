# Frontend Component Development Contract

These rules apply to shared UI and feature UI work in `src/apps/web`.

## Scope / Trigger

Use this contract when a task:

- Adds or modifies shared UI under `src/apps/web/src/components/ui/*`.
- Adds feature components that render buttons, forms, dialogs, drawers, lists,
  tables, alerts, skeletons, or status badges.
- Changes `src/apps/web/components.json`, `src/apps/web/src/app/globals.css`,
  or other Tailwind/shadcn configuration.
- Migrates old UI code or introduces a reusable visual pattern.

## Stack And Configuration Contract

The web frontend uses Tailwind CSS 4 and shadcn/ui.

`src/apps/web/components.json` is the shadcn source of truth and must keep these
values unless this spec is updated in the same task:

| Field | Required value |
| --- | --- |
| `style` | `radix-luma` |
| `rsc` | `true` |
| `tsx` | `true` |
| `tailwind.config` | empty string |
| `tailwind.css` | `src/app/globals.css` |
| `tailwind.baseColor` | `mist` |
| `tailwind.cssVariables` | `true` |
| `iconLibrary` | `lucide` |
| `aliases.ui` | `@/components/ui` |
| `aliases.utils` | `@/lib/utils` |

Tailwind theme tokens live in `src/apps/web/src/app/globals.css`. The file must
remain Tailwind 4 style and import:

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";
```

Do not add a Tailwind 3 `tailwind.config.*` file back to `src/apps/web` unless
the web stack is intentionally reverted and this spec is updated.

## Shared UI Directory Contract

`src/apps/web/src/components/ui/*` is the only shared UI component entrypoint.

Allowed in `components/ui/*`:

- shadcn primitives.
- Project-compatible wrappers around shadcn primitives.
- Primitive visual variants implemented with `class-variance-authority`.
- Accessibility and localization behavior that applies across the product.

Forbidden in `components/ui/*`:

- API calls.
- TanStack Query hooks.
- auth/session logic.
- feature-specific state machines.
- domain entity types such as users, documents, providers, or knowledge bases.
- page-specific data fetching.
- feature copy imported from `src/apps/web/src/copy/*`.

`src/apps/web/src/features/ui/*` must not be reintroduced. Business code must not
import `../ui/*`; shared UI imports must use `@/components/ui/*`.

Business code must not import `radix-ui` directly. Radix imports are allowed only
inside `src/apps/web/src/components/ui/*`.

## Common Shared Imports

Use these common imports for shared UI. This list is not exhaustive; the
Current Shared UI API table below is the source of truth for project wrappers.

```tsx
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/alert";
import { DialogFrame } from "@/components/ui/dialog";
import { SelectField } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
```

Use this helper for Tailwind class merging:

```tsx
import { cn } from "@/lib/utils";
```

Use this type for form submit handlers:

```tsx
import type { FormSubmitHandler } from "@/lib/form-types";
```

Do not import or annotate form submit handlers with React's `FormEvent`.

## Current Shared UI API

These project wrappers are part of the frontend component API:

| Export | File | Contract |
| --- | --- | --- |
| `Button` | `@/components/ui/button` | Defaults to `type="button"` and supports `disabledReason`. |
| `ButtonLink` | `@/components/ui/button` | Uses `Button asChild` with Next.js `Link`. |
| `Notice` | `@/components/ui/alert` | Supports `info`, `error`, and `success` tones for inline contextual states. |
| `Panel`, `PanelHeader` | `@/components/ui/card` | Project panel wrappers built on `Card` primitives. |
| `DialogFrame` | `@/components/ui/dialog` | Controlled open dialog wrapper with `title`, `description`, `onClose`, and optional `onSubmit`. |
| `SelectField` | `@/components/ui/select` | Option-array wrapper with `ariaLabel`, `options`, `value`, `onChange`, `placement`, and `tone`. |
| `Drawer` | `@/components/ui/sheet` | Detail panel wrapper built on `Sheet`. |
| `ScrollArea` | `@/components/ui/scroll-area` | Supports bounded `size` values, accessible region behavior, and `viewportRef` for feature code that must scroll the Radix viewport directly. |
| `StatusPill` | `@/components/ui/badge` | Project status wrapper built on `Badge`. |
| `SkeletonBlock`, `AppShellSkeleton` | `@/components/ui/skeleton` | Loading skeleton wrappers built on `Skeleton`. |
| `Toaster` | `@/components/ui/sonner` | Global Sonner toaster mounted by `AppProviders`. |

Do not add new wrapper props unless the behavior is used by at least one
production component and cannot be expressed by the underlying shadcn primitive.

## Button Contract

Use `Button` from `@/components/ui/button` for actions. Use `ButtonLink` from
`@/components/ui/button`, or `Button asChild` with Next.js `Link`, for
navigational controls styled as buttons.

The semantic HTML requirement means the shadcn/project `Button` must render a
proper `<button>` element. It is not permission for feature code to bypass the
shared wrapper with raw styled `<button>` elements.

Rules:

- `Button` defaults to `type="button"`.
- `Button`'s default size is for single-line controls. When a feature renders a
  `Button` as a multi-line card/list item, its class contract must explicitly
  override the fixed height and no-wrap behavior, for example with `h-auto` and
  `whitespace-normal`.
- Submit buttons must explicitly set `type="submit"`.
- Disabled buttons that hide why an action is unavailable must pass
  `disabledReason`.
- Icon-only buttons must include `aria-label` or screen-reader text.
- Use `variant="destructive"` or `variant="danger"` for destructive actions.
- Use `Button asChild` only when the child element provides the semantic role,
  such as Next.js `Link`.

Wrong:

```tsx
<Button disabled>保存</Button>
```

Correct:

```tsx
<Button disabled disabledReason="正在保存配置。">
  保存
</Button>
```

## Feedback Contract

Use global Sonner toasts for non-blocking success feedback after mutations.

Required:

```tsx
import { toast } from "sonner";

toast.success(message);
```

`Toaster` must be mounted once by `src/apps/web/src/features/api/app-providers.tsx`.

Use inline `Notice` or `Alert` only for contextual page or dialog states:

- loading.
- empty.
- error.
- forbidden.
- validation.
- retry.

Do not render successful mutation confirmations as inline page notices.

Wrong:

```tsx
<Notice tone="success">用户信息已更新。</Notice>
```

Correct:

```tsx
toast.success("用户信息已更新。");
```

## Dialog And Sheet Contract

Use:

- `Dialog` primitives for general modal composition.
- `DialogFrame` for form dialogs with a title, description, close action, and
  optional submit handler.
- `AlertDialog` for destructive confirmations.
- `Sheet` or `Drawer` for side-panel/detail interactions.

Dialog and sheet wrappers must:

- Keep close controls keyboard accessible.
- Use Chinese screen-reader text for close controls.
- Constrain content to the viewport.
- Scroll internally when form content grows.
- Keep submit and close actions reachable.

Destructive row or record actions must use a confirmation dialog before calling
the mutation.

## Select Contract

Use `SelectField` when feature code has an option array:

```tsx
<SelectField
  ariaLabel="角色"
  options={roleOptions}
  value={role}
  onChange={(value) => setRole(value as Role)}
/>
```

Use lower-level `Select` primitives only when custom select composition is
needed. Do not build custom dropdown/listbox behavior in feature code.

`SelectFieldOption` values must be stable strings. Do not use translated labels
as values.

## Layout And Scroll Contract

Use `ScrollArea` for bounded scroll regions that need consistent shadcn styling
or an accessible region label.

Use `viewportRef` when feature code must programmatically scroll the region. The
ref must attach to `ScrollAreaPrimitive.Viewport`, not the root, so the Radix
scrollbar thumb stays synchronized with `scrollTop`.

Scrollable flex children must use `min-h-0`.

When a `ScrollArea` needs padding or vertical gaps between rendered items, put
those spacing classes on an explicit content wrapper inside `ScrollArea`.
`ScrollArea`'s `className` applies to the Radix root, not to the viewport's
actual children, so root-level `space-y-*` or item padding will not separate the
rendered scroll items reliably.

Parent components own external placement and spacing. Shared UI components own
their internal padding, typography, borders, and interaction states.

Do not put page-specific grid or viewport-height decisions into
`components/ui/*`; keep those helpers in the owning feature module.

## Token Contract

Feature UI and project-authored wrapper styles must use semantic tokens instead
of legacy color families. Registry-generated shadcn primitive styles may keep
their generated overlay/backdrop classes, but do not add new legacy color
classes to feature components or project wrapper extensions.

| Legacy style | Required token |
| --- | --- |
| `bg-white` for app surfaces | `bg-card` or `bg-background` |
| `text-slate-950` | `text-foreground` |
| `text-slate-500`, `text-slate-600`, `text-slate-700` | `text-muted-foreground` |
| `border-slate-200` | `border-border` |
| `divide-slate-200` | `divide-border` |
| `bg-slate-50`, `bg-slate-100` | `bg-muted` |
| teal primary action classes | `bg-primary text-primary-foreground` or `variant="default"` |
| red destructive action classes | `text-destructive`, `bg-destructive`, or a destructive variant |

New feature UI and project wrapper code must not introduce these legacy visual
classes:

- `slate-*`
- `teal-*`
- `red-*`
- `blue-*`
- `yellow-*`
- `bg-white`
- `text-white`
- `bg-black`
- `rounded-md`

If the product needs an additional semantic status color, add a theme token in
`globals.css` and update this spec in the same task. Do not encode the status
with raw color families in feature components.

## Copy Contract

Visible text and screen-reader text in shared UI wrappers must be Chinese.

Allowed English product terms include `API Key`, `Provider`, `Base URL`, model
IDs, and provider names. Generic generated strings such as `Close` must be
replaced with product copy such as `关闭` before production use.

## Adding shadcn Components

Add new shadcn components from the web workspace:

```bash
pnpm dlx shadcn@latest add <component> --cwd src/apps/web
```

After adding a component:

- Keep generated primitives in `src/apps/web/src/components/ui/*`.
- Preserve `@/components/ui/*` and `@/lib/utils` aliases.
- Localize visible and screen-reader text.
- Remove unused imports and generated examples.
- Run the frontend quality commands listed in `quality-guidelines.md`.

## Tests Required

For changes to shared UI or component-system rules, include or update tests that
assert the contract when the rule can be checked statically.

Existing static contracts include:

- `src/apps/web/src/features/shell/shadcn-migration-contract.test.ts`
- `src/apps/web/src/features/shell/sonner-feedback-contract.test.ts`

These tests cover:

- No business imports from legacy `features/ui`.
- No legacy UI style files.
- Form submit types live in `src/lib`.
- No legacy visual source classes in production UI.
- Global Sonner toaster is mounted.
- Successful mutation feedback uses `toast.success`.

## Wrong vs Correct

### Wrong

```tsx
import { Button } from "../ui/button";
import { Dialog as DialogPrimitive } from "radix-ui";

<button className="rounded-md bg-teal-700 text-white">保存</button>
```

### Correct

```tsx
import { Button } from "@/components/ui/button";
import { DialogFrame } from "@/components/ui/dialog";

<Button type="submit">保存</Button>
```
