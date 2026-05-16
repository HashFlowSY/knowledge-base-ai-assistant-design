# Frontend Functional MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the PRD-defined responsive, multi-route, interactive frontend MVP for the knowledge-base AI assistant.

**Architecture:** Use a single client-side mock store persisted to `localStorage` as the frontend-only data boundary, with Server Component route files delegating interactive behavior to feature Client Components. A protected shell owns navigation, mock session behavior, role visibility, and reusable layout/skeleton/list primitives.

**Tech Stack:** Next.js 16 App Router, React 19.2, strict TypeScript, Tailwind CSS, lucide-react, Vitest, Playwright smoke tests.

---

### File Structure

**Shared foundation**
- Create: `src/apps/web/src/features/mock/types.ts` for PRD enum and entity contracts.
- Create: `src/apps/web/src/features/mock/seed.ts` for deterministic seed data with stable ids.
- Create: `src/apps/web/src/features/mock/store.tsx` for reducer, localStorage hydration/recovery, session, permissions, and mutations.
- Create: `src/apps/web/src/features/mock/store.test.ts` for PRD behavior tests.
- Create: `src/apps/web/src/features/ui/skeleton.tsx`, `button.tsx`, `dialog.tsx`, `drawer.tsx`, `status.tsx`, `notice.tsx`, and `list.tsx` for repeated UI patterns.
- Create: `src/apps/web/src/features/shell/app-shell.tsx` and `navigation.ts` for protected navigation, role switcher, reset control, mobile nav, and active state.
- Create: `src/apps/web/src/copy/common.ts`, `auth.ts`, `knowledge.ts`, `chat.ts`, `admin.ts`, and keep `workspace.ts` only if still useful.

**Routes**
- Modify: `src/apps/web/src/app/layout.tsx` to mount the mock store provider.
- Modify: `src/apps/web/src/app/page.tsx` to redirect to `/workspace`.
- Create: route files for `/login`, `/workspace`, `/chat`, `/documents`, `/documents/[documentId]`, `/tasks`, `/logs`, `/providers`, `/users`, `/audit`, `/unauthorized`, `not-found`, and matching `loading.tsx` skeleton routes.

**Feature pages**
- Create or replace workspace page components for interactive KB selection, create, upload, URL import, document links, task/log summaries.
- Create chat page components for session list, transcript, lifecycle mode, citations, feedback, retry, and citation document navigation.
- Create documents page/detail components for list URL state, source preview, chunks, chunk drawer, highlight via URL state, related links.
- Create admin page components using shared list shell for tasks, logs, providers, users, and audit.

**Tests**
- Replace `src/apps/web/src/copy/bootstrap.test.ts` with copy/route contract tests.
- Update `e2e/bootstrap.spec.ts` into route smoke plus core happy path coverage.

### Task 1: Mock Store Contract

**Files:**
- Create: `src/apps/web/src/features/mock/types.ts`
- Create: `src/apps/web/src/features/mock/seed.ts`
- Create: `src/apps/web/src/features/mock/store.tsx`
- Create: `src/apps/web/src/features/mock/store.test.ts`

- [ ] Step 1: Write failing tests for storage recovery, login redirect safety, role access, imports, and chat feedback.
- [ ] Step 2: Run `pnpm --filter @kb/web test -- src/features/mock/store.test.ts` and verify failure from missing modules.
- [ ] Step 3: Implement precise types, seed state, reducer, mutation helpers, and pure permission helpers.
- [ ] Step 4: Run the same test and verify pass.

### Task 2: App Shell And Route Skeletons

**Files:**
- Modify: `src/apps/web/src/app/layout.tsx`
- Modify: `src/apps/web/src/app/page.tsx`
- Create: route files and `loading.tsx` files for all PRD routes.
- Create: shared UI primitives and shell components.

- [ ] Step 1: Add tests covering required route metadata/copy and navigation visibility for admin/member.
- [ ] Step 2: Implement protected shell, mobile/desktop nav, role switcher, reset demo data, unauthorized handling, and skeleton components.
- [ ] Step 3: Ensure every visible shell button acts or is disabled with a reason.

### Task 3: Core Knowledge And Chat Flow

**Files:**
- Replace workspace components under `src/apps/web/src/features/workspace/`.
- Create chat components under `src/apps/web/src/features/chat/`.
- Create document components under `src/apps/web/src/features/documents/`.

- [ ] Step 1: Add tests for workspace mutations and chat reducer behavior.
- [ ] Step 2: Implement create KB, file upload, URL import, task/document visibility, document detail chunk/search/drawer behavior.
- [ ] Step 3: Implement chat session selection, new session, lifecycle modes, citations, retry, and feedback.

### Task 4: Admin And Operations Pages

**Files:**
- Create shared admin list components under `src/apps/web/src/features/admin/`.
- Create pages for tasks, logs, providers, users, and audit.

- [ ] Step 1: Add representative tests for search/filter/sort URL state and mutation outcomes.
- [ ] Step 2: Implement task retry/cancel, log drawer/copy fallback notice, provider actions, user actions, audit open-target behavior.
- [ ] Step 3: Verify member cannot navigate or directly view admin pages.

### Task 5: Verification

**Files:**
- Update: `e2e/bootstrap.spec.ts`

- [ ] Step 1: Run `pnpm --filter @kb/web test`.
- [ ] Step 2: Run `pnpm --filter @kb/web typecheck`.
- [ ] Step 3: Run `pnpm --filter @kb/web lint`.
- [ ] Step 4: Run `pnpm --filter @kb/web build`.
- [ ] Step 5: Run Playwright if browser binaries are available; otherwise record the exact blocker.
- [ ] Step 6: Start the dev server and inspect desktop/mobile via Browser when available.
