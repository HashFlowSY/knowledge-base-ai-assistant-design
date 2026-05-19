# brainstorm: 修复体验后 bug

## Goal

集中记录并修复用户实际体验后发现的 bug，让本任务成为后续排查、实现、验证和提交的工作入口。

## What I Already Know

* 用户希望创建一个任务，目的是修复体验后的 bug。
* 当前仓库由 Trellis 管理，任务目录位于 `.trellis/tasks/`。
* 创建本任务前工作区干净，没有 active task。
* 本任务先进入 planning 状态，暂不直接修改业务代码。
* Bug 1：直接访问 `http://127.0.0.1:3000` 后，页面 URL 会先带上 `/workspace`，随后未登录状态进入 login 流程。

## Assumptions (Temporary)

* bug 可能来自前端交互、后端接口、认证、环境配置或跨层数据流，需要等用户补充复现信息后再定范围。
* 每个 bug 应尽量包含复现步骤、实际结果、预期结果和影响范围。

## Open Questions

* Bug 1：暂无阻塞问题；根路径入口行为已确认并修复。

## Requirements (Evolving)

* 记录体验后发现的 bug，并按影响范围和优先级拆解。
* Bug 1：修复根路径 `/` 访问时不符合预期的默认跳转行为，避免用户在未登录入口阶段看到错误或令人困惑的 `/workspace` URL。
* 对每个可复现 bug 定位根因，修复后补充必要测试或验证步骤。
* 修复完成后运行项目相关 lint、type-check 和测试。

## Acceptance Criteria (Evolving)

* [x] 至少记录一个可复现 bug，包括复现步骤、实际结果和预期结果。
* [x] Bug 1：明确根路径 `/` 在未登录和已登录状态下的预期跳转行为。
* [x] Bug 1：根路径 `/` 默认跳转到 `/login`，不再无条件跳转到 `/workspace`。
* [x] 每个进入实现范围的 bug 都有明确修复方案。
* [x] 修复后的相关流程通过手动验证或自动化测试。
* [x] 项目 lint、type-check 和相关测试通过，或记录无法运行的原因。

## Definition of Done (Team Quality Bar)

* Tests added/updated (unit/integration where appropriate)
* Lint / typecheck / CI green
* Docs/notes updated if behavior changes
* Rollout/rollback considered if risky

## Out of Scope (Explicit)

* 不在没有复现信息的情况下直接改业务代码。
* 不处理与本次体验反馈无关的新功能需求，除非它是修复 bug 的必要前置。
* “使用 `127.0.0.1` 访问时登录提示无权限”不视为本任务问题，不在本任务内修复。

## Technical Notes

* Task directory: `.trellis/tasks/05-19-fix-experience-bugs`
* Relevant spec layers available: backend, frontend, ops, shared, testing
* Phase 2 implementation should load `trellis-before-dev` before code changes.
* Root cause evidence for Bug 1:
  * `src/apps/web/src/app/page.tsx` currently redirects `/` to `/workspace`.
  * `src/apps/web/src/features/shell/session-gate.ts` redirects unauthenticated protected pages to `/login?redirectTo=<pathname>`, so `/workspace` becomes `/login?redirectTo=%2Fworkspace`.
* Fix for Bug 1:
  * `src/apps/web/src/app/page.tsx` now redirects `/` to `/login`.
  * `src/apps/web/src/app/page.test.ts` covers the root redirect regression.
* Verification for Bug 1:
  * `pnpm --filter @kb/web typecheck`
  * `pnpm --filter @kb/web lint`
  * `pnpm --filter @kb/web test`
  * `pnpm --filter @kb/web build`
  * `pnpm test:e2e --grep "opens login directly for unauthenticated root visits"`
  * `pnpm typecheck`
  * `pnpm lint`
  * `pnpm test`
