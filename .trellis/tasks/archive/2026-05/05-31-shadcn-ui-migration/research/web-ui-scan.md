# Web UI Scan

## Scope

Scanned `src/apps/web` before planning the shadcn/ui migration.

## Stack and Configuration

* App: Next.js 16 App Router, React 19.2, TypeScript strict.
* Package: `src/apps/web/package.json`.
* Scripts available: `dev`, `build`, `typecheck`, `lint`, `test`.
* shadcn/ui configuration exists at `src/apps/web/components.json`.
* `components.json` sets:
  * `style`: `radix-luma`
  * `tailwind.css`: `src/app/globals.css`
  * `baseColor`: `mist`
  * aliases: `@/components`, `@/components/ui`, `@/lib/utils`
  * icon library: `lucide`
* `src/apps/web/src/app/globals.css` imports Tailwind v4, `tw-animate-css`, and `shadcn/tailwind.css`.
* `globals.css` defines the shadcn token bridge: `background`, `foreground`, `card`, `popover`, `primary`, `secondary`, `muted`, `accent`, `destructive`, `border`, `input`, `ring`, sidebar tokens, chart tokens, and radius tokens.
* `src/apps/web/src/lib/utils.ts` exposes `cn()` using `clsx` and `tailwind-merge`.

## Existing shadcn/ui Components

Existing components under `src/apps/web/src/components/ui`:

* `button.tsx`
* `dialog.tsx`
* `sheet.tsx`
* `select.tsx`
* `input.tsx`
* `textarea.tsx`
* `label.tsx`
* `checkbox.tsx`
* `table.tsx`
* `card.tsx`
* `badge.tsx`
* `alert.tsx`
* `alert-dialog.tsx`
* `scroll-area.tsx`
* `skeleton.tsx`

Current feature code does not directly import these shadcn components except internal imports between shadcn components. The business UI layer still imports `src/features/ui/*`.

## Existing Compatibility Layer

Current files under `src/apps/web/src/features/ui`:

* `button.tsx`
* `button-styles.ts`
* `dialog.tsx`
* `drawer.tsx`
* `drawer-rules.ts`
* `drawer-styles.ts`
* `form-types.ts`
* `list-item-styles.ts`
* `notice.tsx`
* `panel.tsx`
* `scroll-area.ts`
* `select-field.tsx`
* `select-field-styles.ts`
* `skeleton.tsx`
* `skeleton-variants.ts`
* `status.tsx`

The style files explicitly called out by the user exist:

* `features/ui/button-styles.ts`
* `features/ui/select-field-styles.ts`
* `features/ui/drawer-styles.ts`

## Current Old UI Imports

Business features import old UI wrappers from `../ui/*` across shell, auth, admin, workspace, and chat.

Main old entry imports found:

* `../ui/button`: shell, auth, admin, workspace, chat, query error states.
* `../ui/dialog`: admin/user dialogs, provider config dialog, workspace dialogs.
* `../ui/select-field`: admin filters/pagination, user dialog role select, chat knowledge base picker.
* `../ui/drawer`: admin user detail drawer.
* `../ui/panel`: admin pages, workspace pages, chat panels, unauthorized page.
* `../ui/notice`: shell, auth, admin, workspace, chat.
* `../ui/status`: chat message badges.
* `../ui/scroll-area`: admin, workspace, chat scroll regions.
* `../ui/skeleton`: app loading states and app shell loading.
* `../ui/list-item-styles`: workspace list item and chat citation/session actions.

There is also a direct type import from `../ui/select-field-styles` in `features/chat/chat-layout.ts` for `SelectFieldPlacement`.

## Direct Replacement Candidates

These are likely simple or mostly simple replacements because shadcn equivalents already exist:

* `features/ui/button.tsx` can wrap or re-export shadcn `Button`, preserving legacy variants temporarily.
* `features/ui/skeleton.tsx` can use shadcn `Skeleton` internally.
* Raw text inputs in login/admin/workspace can move toward shadcn `Input` plus `Label`.
* Raw textareas in chat/workspace can move toward shadcn `Textarea`.
* `features/ui/notice.tsx` can map to shadcn `Alert` variants.
* `features/ui/status.tsx` can map to shadcn `Badge` variants.
* `features/ui/panel.tsx` can map to shadcn `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`.

## Wrapper Candidates

These need wrappers because the current contract does not match a plain shadcn component:

* `features/ui/button.tsx`
  * Current API has legacy variants: `primary`, `secondary`, `ghost`, `danger`, `inverse`.
  * Current `Button` adds `disabledReason` as `title` plus screen-reader text.
  * Current `ButtonLink` wraps Next `Link`.
  * shadcn variants are `default`, `outline`, `secondary`, `ghost`, `destructive`, `link`; sizes differ and default height is `h-9`, while legacy buttons use `min-h-11`.
* `features/ui/select-field.tsx`
  * Current API is value/options/onChange with `ariaLabel`, `tone`, and `placement`.
  * Current implementation is custom button/listbox and has keyboard behavior tests.
  * shadcn `Select` is Radix-based and should be wrapped to preserve current props.
* `features/ui/dialog.tsx`
  * Current `DialogFrame` is controlled externally by conditional rendering plus `onClose`.
  * It optionally wraps content in a `<form>`.
  * shadcn `Dialog` wants `open/onOpenChange` composition and has separate header/footer/content primitives.
* `features/ui/drawer.tsx`
  * Current `Drawer` behaves as a responsive detail side panel: bottom fixed on mobile, static column on large screens.
  * shadcn `Sheet` is overlay-first; using it directly would change layout semantics.
  * This should remain a wrapper or become a card/sheet hybrid only after an explicit UX decision.
* `features/ui/scroll-area.ts`
  * Current wrapper is a simple `<div>` with size presets and native scrolling.
  * shadcn `ScrollArea` changes DOM shape and uses Radix viewport/scrollbar.
  * Existing callers depend on `onScroll` and flex fill classes.
* `features/ui/list-item-styles.ts`
  * Not a shadcn component. It centralizes repeated action-row styles and active states.
  * It should be converted to token-based classes or replaced by a proper wrapper component.
* `features/ui/skeleton.tsx`
  * App-shell skeletons are layout-specific and should remain feature wrappers that compose shadcn `Skeleton`.

## Hardcoded Legacy Styling Outside `features/ui`

There are many direct Tailwind classes using legacy visual tokens:

* `slate-*`, `teal-*`, `red-*`, `blue-*`, `yellow-*`
* `rounded-md`
* `border-slate-200`, `bg-white`, `bg-slate-50`, `bg-slate-100`
* `focus:border-teal-500`, `focus:ring-teal-100`

These appear in:

* `features/shell/app-shell.tsx`
* `features/auth/login-page.tsx`
* `features/admin/*`
* `features/workspace/*`
* `features/chat/*`
* `features/ui/*`
* `src/app/not-found.tsx`
* loading states under `src/app/**/loading.tsx`

This means migrating wrapper internals alone will not fully satisfy "all components share one token/variant/spacing/radius/state style set"; page-level and feature-level hardcoded style helpers also need a token migration pass.

## Existing Tests That Will Need Updates

Tests currently assert old class names directly:

* `features/ui/button.test.ts`
* `features/ui/select-field.test.ts`
* `features/ui/drawer.test.ts`
* `features/ui/scroll-area.test.ts`
* `features/ui/list-item-styles.test.ts`
* `features/admin/admin-list-layout.test.ts`
* `features/workspace/workspace-layout.test.ts`
* `features/chat/chat-layout.test.ts`

Some tests assert behavior/layout constraints that should remain, but class-name assertions should be rewritten to check contracts aligned with shadcn tokens or wrapper behavior.

## Initial Risk Notes

* A naive direct replacement of `Button` would shrink touch targets from legacy `min-h-11` to shadcn `h-9`, conflicting with the frontend touch target guideline unless the wrapper maps sizes deliberately.
* A direct replacement of `SelectField` would change keyboard behavior, menu placement, portal behavior, and DOM structure. Wrapper migration is safer.
* A direct replacement of `Drawer` with shadcn `Sheet` may change desktop detail-panel layout from in-page static panel to modal overlay.
* shadcn uses rounded `3xl/4xl` in current generated components, while legacy wrappers use `rounded-md`. A single radius policy needs to be explicit before broad visual migration.
* The current app shell and many feature pages encode a dark slate sidebar and teal brand accent outside shadcn tokens. Keeping that as-is would violate "shadcn is visual source" unless mapped to tokens or intentionally scoped as product chrome.
