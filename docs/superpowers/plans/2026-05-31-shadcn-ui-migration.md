# Shadcn UI Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the `src/apps/web` migration from `features/ui/*` legacy UI entries to shadcn/ui primitives and the current shadcn visual system.

**Architecture:** Keep shadcn primitives in `src/apps/web/src/components/ui/*` as the visual source. Move reusable non-visual form typing to `src/apps/web/src/lib/form-types.ts`. Replace business feature imports from `features/ui/*` with direct shadcn primitive imports or feature-local composition, then delete obsolete legacy entries and style helpers.

**Tech Stack:** Next.js 16 App Router, React 19.2, TypeScript strict, Tailwind CSS v4, shadcn/ui `radix-luma`, Vitest.

---

### Task 1: Add Migration Contract Tests

**Files:**
- Create: `src/apps/web/src/features/shell/shadcn-migration-contract.test.ts`

- [ ] **Step 1: Write failing contract tests**

```ts
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const webRoot = process.cwd();
const sourceRoots = ["src/features", "src/app"];

function readSourceFiles(root: string): string[] {
  // Implement with readdirSync recursion in the test.
  return [];
}

describe("shadcn migration contract", () => {
  it("keeps business code off legacy features/ui entries", () => {
    const offenders = readSourceFiles(webRoot).filter((file) => {
      const source = readFileSync(file, "utf8");
      return /from\s+["'][.]{1,2}\/ui\//.test(source);
    });

    expect(offenders).toEqual([]);
  });

  it("removes legacy UI style files", () => {
    const removedFiles = [
      "src/features/ui/button-styles.ts",
      "src/features/ui/select-field-styles.ts",
      "src/features/ui/drawer-styles.ts",
    ];

    expect(removedFiles.filter((file) => existsSync(join(webRoot, file)))).toEqual([]);
  });

  it("keeps form submit types in src/lib", () => {
    expect(existsSync(join(webRoot, "src/lib/form-types.ts"))).toBe(true);
    expect(existsSync(join(webRoot, "src/features/ui/form-types.ts"))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test and verify RED**

Run: `pnpm --filter @kb/web test src/features/shell/shadcn-migration-contract.test.ts`

Expected: FAIL because business code still imports `../ui/*`, old style files still exist, and `src/lib/form-types.ts` does not exist.

### Task 2: Migrate Form Submit Type

**Files:**
- Create: `src/apps/web/src/lib/form-types.ts`
- Delete: `src/apps/web/src/features/ui/form-types.ts`
- Modify: current imports of `../ui/form-types`
- Modify: `.trellis/spec/frontend/component-guidelines.md`

- [ ] **Step 1: Move the type**

Create `src/lib/form-types.ts` with:

```ts
import type { ComponentPropsWithoutRef } from "react";

export type FormSubmitHandler = NonNullable<ComponentPropsWithoutRef<"form">["onSubmit"]>;
```

- [ ] **Step 2: Update imports**

Replace feature imports from `../ui/form-types` with the correct relative path to `../../lib/form-types`.

- [ ] **Step 3: Update the frontend spec example**

Change `.trellis/spec/frontend/component-guidelines.md` to import from `@/lib/form-types`.

- [ ] **Step 4: Run targeted tests**

Run: `pnpm --filter @kb/web typecheck`

Expected: PASS for form type imports before deleting more legacy UI code.

### Task 3: Replace Legacy UI Components in Business Code

**Files:**
- Modify: `src/apps/web/src/features/**/*.tsx`
- Modify: `src/apps/web/src/app/**/*.tsx`

- [ ] **Step 1: Replace `Button` and `ButtonLink` usages**

Use `Button` from `@/components/ui/button`. For links, use `Button asChild` with `next/link`.

- [ ] **Step 2: Replace `Panel` usages**

Use `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, and `CardAction` from `@/components/ui/card`.

- [ ] **Step 3: Replace `Notice` usages**

Use `Alert`, `AlertTitle` when useful, and `AlertDescription` from `@/components/ui/alert`.

- [ ] **Step 4: Replace `StatusPill` usages**

Use `Badge` from `@/components/ui/badge`.

- [ ] **Step 5: Replace app skeleton imports**

Move app-shell skeleton helpers out of `features/ui` or compose them directly from `@/components/ui/skeleton` in a non-legacy location.

### Task 4: Replace Select, Dialog, Drawer, and ScrollArea Contracts

**Files:**
- Modify: admin, workspace, chat dialog/filter/detail files.
- Modify: files using `SelectField`, `DialogFrame`, `Drawer`, `ScrollArea`.

- [ ] **Step 1: Replace `SelectField`**

Use shadcn `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, and `SelectItem`.

- [ ] **Step 2: Replace `DialogFrame`**

Use shadcn `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, and `DialogFooter`.

- [ ] **Step 3: Replace `Drawer`**

Use shadcn `Sheet`, `SheetContent`, `SheetHeader`, `SheetTitle`, and `SheetDescription`. User detail uses overlay interaction.

- [ ] **Step 4: Replace `ScrollArea`**

Use shadcn `ScrollArea` where compatible. If native `onScroll` is needed, keep a feature-local scroll container with shadcn token classes, not `features/ui`.

### Task 5: Migrate Hardcoded Legacy Visual Classes

**Files:**
- Modify: `src/apps/web/src/features/**/*.{ts,tsx}`
- Modify: `src/apps/web/src/app/**/*.{ts,tsx}`

- [ ] **Step 1: Replace color utilities**

Replace `slate-*`, `teal-*`, `red-*`, `blue-*`, and `yellow-*` visual classes in touched UI with shadcn token utilities such as `bg-background`, `bg-card`, `bg-muted`, `text-foreground`, `text-muted-foreground`, `border-border`, `text-destructive`, and `ring-ring`.

- [ ] **Step 2: Replace legacy radius**

Replace `rounded-md` component surfaces with shadcn current radius choices, normally `rounded-2xl`, `rounded-3xl`, or `rounded-4xl` depending on the primitive being matched.

- [ ] **Step 3: Replace old focus states**

Replace `focus:border-teal-*` and `focus:ring-teal-*` with `focus-visible:border-ring` and `focus-visible:ring-3 focus-visible:ring-ring/30`.

### Task 6: Delete Legacy UI Entries and Update Tests

**Files:**
- Delete obsolete files under `src/apps/web/src/features/ui`
- Modify tests asserting old class names.

- [ ] **Step 1: Delete unused legacy UI files**

Delete legacy UI component entries and style helpers after imports are removed.

- [ ] **Step 2: Update tests**

Remove tests that only assert deleted helper class strings. Update layout tests to assert behavior or token-based contracts.

- [ ] **Step 3: Run contract test and verify GREEN**

Run: `pnpm --filter @kb/web test src/features/shell/shadcn-migration-contract.test.ts`

Expected: PASS.

### Task 7: Final Verification

**Files:**
- All changed files.

- [ ] **Step 1: Run web unit tests**

Run: `pnpm --filter @kb/web test`

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run: `pnpm --filter @kb/web typecheck`

Expected: PASS.

- [ ] **Step 3: Run lint**

Run: `pnpm --filter @kb/web lint`

Expected: PASS.

- [ ] **Step 4: Run final scans**

Run: `rg -n "from [\"'][.]{1,2}/ui/|button-styles|select-field-styles|drawer-styles|slate-|teal-|rounded-md|focus:ring-teal|focus:border-teal" src/apps/web/src/features src/apps/web/src/app`

Expected: no legacy UI entries or old visual-source classes remain, except intentional non-visual strings if any are justified in the final report.
