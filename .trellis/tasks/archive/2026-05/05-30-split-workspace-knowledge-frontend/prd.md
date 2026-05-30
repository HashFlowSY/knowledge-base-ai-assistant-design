# 拆分 Workspace 知识库前端页面

## Goal

拆分 `src/apps/web/src/features/workspace/workspace-mvp-page.tsx`，取消 `mvp` 命名，降低单文件复杂度，同时保持 Workspace / 知识库页面的现有用户行为、API 调用、URL 状态、上传流程和视觉结构不变。

## What I already know

* 用户明确要求创建 Trellis 任务，并在开始实现前再次明确影响范围。
* 本任务只处理 Workspace / 知识库前端页面拆分，不处理后端文档上传链路、AI provider、ingestion、mock store 或数据库迁移。
* 当前 `workspace-mvp-page.tsx` 为 923 行，主要包含：
  * `WorkspaceMvpPage` 页面容器和 URL query 状态。
  * 知识库无限滚动列表。
  * 选中知识库概要面板。
  * 文档上传弹窗。
  * 创建/编辑知识库弹窗。
  * 成员选择器。
  * 表单字段、空状态、时间/成员摘要/query param helper。
* 直接入口是 `src/apps/web/src/app/workspace/page.tsx`，当前 import `WorkspaceMvpPage`。
* 用户要求取消 `mvp` 命名，因此拆分时需要把页面入口文件和组件命名改成稳定命名，例如 `workspace-page.tsx` / `WorkspacePage`。
* 用户要求“单功能单组件”，因此组件拆分需要以单一职责为边界，避免一个组件或组件文件承载多个功能块。
* 相关稳定模块已经存在：
  * `src/apps/web/src/features/workspace/workspace-layout.ts`
  * `src/apps/web/src/features/workspace/workspace-upload-helpers.ts`
  * `src/apps/web/src/features/knowledge/knowledge-hooks.ts`
  * `src/apps/web/src/copy/knowledge.ts`
* 现有 contract test 会读取 `workspace-mvp-page.tsx` 源码检查关键字符串，拆分后需要更新测试，让它检查新的真实组件边界，而不是强绑定大文件。

## Assumptions

* 这是重构任务，不改变产品行为、UI 文案、接口 contract 或后端调用。
* 不引入新依赖，不改 Tailwind / shadcn / TanStack Query 使用方式。
* 将 `WorkspaceMvpPage` 改名为 `WorkspacePage`，并将 `workspace-mvp-page.tsx` 改为 `workspace-page.tsx`。
* 可以新增同目录组件/helper 文件，并更新对应测试。

## Impact Scope

### In Scope

* `src/apps/web/src/features/workspace/workspace-mvp-page.tsx`
* `src/apps/web/src/features/workspace/workspace-page.tsx`
* 新增 `src/apps/web/src/features/workspace/*` 下的拆分组件/helper 文件
* 必要时更新：
  * `src/apps/web/src/app/workspace/page.tsx`
  * `src/apps/web/src/features/workspace/workspace-page-contract.test.ts`
  * `src/apps/web/src/features/workspace/workspace-layout.test.ts`
  * `src/apps/web/src/features/workspace/workspace-upload-helpers.test.ts`
  * `src/apps/web/src/features/knowledge/knowledge-hooks.test.ts`

### Related But Not Expected To Change

* `src/apps/web/src/features/knowledge/knowledge-hooks.ts`
* `src/apps/web/src/features/workspace/workspace-layout.ts`
* `src/apps/web/src/features/workspace/workspace-upload-helpers.ts`
* `src/apps/web/src/copy/knowledge.ts`
* `src/apps/web/src/features/admin/user-hooks.ts`
* `src/apps/web/src/features/auth/auth-hooks.ts`

### Out of Scope

* Backend API / service changes.
* Upload validation rule changes.
* Knowledge-base API schema or hook behavior changes.
* Mock store changes.
* Visual redesign or new user-facing copy.
* Adding new UI libraries or state libraries.

## Proposed Split

* Replace `workspace-mvp-page.tsx` with `workspace-page.tsx` as the thin page orchestrator exporting `WorkspacePage`.
* Component files follow single-function/single-component boundaries:
  * One component file exports one primary React component.
  * A component handles one clear UI responsibility.
  * Shared pure logic goes into helper/type files, not hidden inside component files.
  * Small repeated UI pieces are extracted when they have their own responsibility instead of being nested local functions.
* Extract list UI:
  * `knowledge-base-list.tsx`
  * `knowledge-base-list-item.tsx`
* Extract selected knowledge-base summary UI:
  * `knowledge-base-summary.tsx`
  * `workspace-metric-tile.tsx`
* Extract pending summary UI:
  * `workspace-summary-panel.tsx`
  * `workspace-summary-empty-state.tsx`
* Extract dialogs:
  * `upload-document-dialog.tsx`
  * `knowledge-base-dialog.tsx`
  * `member-picker.tsx`
* Extract shared local UI:
  * `workspace-text-field.tsx`
  * `workspace-textarea-field.tsx`
  * `query-error-state.tsx`
* Extract pure helpers:
  * `workspace-query-params.ts`
  * `workspace-formatters.ts`
  * `workspace-types.ts`

## Requirements

* Preserve current Workspace page behavior:
  * URL search state stays in query params.
  * Knowledge base list keeps infinite-scroll loading.
  * First knowledge base auto-select behavior is unchanged.
  * Admin-only create/edit controls remain admin-only.
  * Upload dialog still validates locally and calls `useUploadDocumentFile`.
  * Create/edit dialog still loads detail, searches members via `useUsers`, and calls create/update hooks.
* Preserve current visual composition and accessibility:
  * Keep semantic actions as buttons/links.
  * Keep existing `Panel`, `DialogFrame`, `ScrollArea`, `Notice`, `Button`, `ButtonLink` primitives.
  * Keep lucide icons already used by the page.
  * No nested card-style page sections or landing-page styling.
  * No UI copy describing implementation details.
* Keep strict TypeScript and avoid `any`.
* Avoid introducing global state or a new state library.
* Update internal imports/tests from MVP naming to stable Workspace naming.
* Enforce single-function/single-component structure for newly extracted component files.

## Acceptance Criteria

* [ ] `workspace-mvp-page.tsx` is removed or replaced, and `workspace-page.tsx` exports `WorkspacePage`.
* [ ] `src/apps/web/src/app/workspace/page.tsx` imports `WorkspacePage` from the non-MVP file.
* [ ] The page orchestrator is materially smaller and does not contain all UI/detail helpers.
* [ ] Extracted component files each own one primary UI responsibility and do not become new multi-purpose buckets.
* [ ] New modules have clear responsibilities and no circular imports.
* [ ] Workspace behavior remains equivalent to current behavior.
* [ ] Static contract tests are updated to validate the new module boundaries without requiring all implementation strings in `workspace-mvp-page.tsx`.
* [ ] Focused workspace/knowledge tests pass.
* [ ] Lint and type-check pass, or any inability to run them is explicitly reported.

## Definition of Done

* Relevant frontend and testing specs read before implementation.
* Tests updated only where they encode old file layout, not to weaken behavior.
* No backend, API schema, copy, or product behavior changes unless explicitly approved.
* No remaining `mvp` naming for the Workspace page entrypoint/component.
* Quality gate run with focused tests plus project lint/type-check where available.

## Open Questions

* Confirm whether the proposed split boundary plus MVP-name removal is approved before implementation.

## Technical Notes

* Current line counts:
  * `workspace-mvp-page.tsx`: 923 lines
  * `workspace-layout.ts`: 77 lines
  * `workspace-upload-helpers.ts`: 168 lines
  * `knowledge-hooks.ts`: 190 lines
* Relevant specs:
  * `.trellis/spec/frontend/index.md`
  * `.trellis/spec/testing/index.md`
  * `.trellis/spec/guides/index.md`
* Current contract test reads `workspace-mvp-page.tsx` directly and must be adjusted after extraction.
