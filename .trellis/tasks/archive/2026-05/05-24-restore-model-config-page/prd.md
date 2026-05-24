# brainstorm: 还原模型配置页面

## Goal

还原 `/providers` 模型配置页面，使管理员能够清晰配置当前系统需要的三类模型服务（问答、向量、重排），并与现有真实 Provider API、安全密钥提交和项目 UI 规范保持一致。

## What I already know

* 用户要求创建任务，主要目标是完成模型配置页面的还原。
* 用户要求任何不清楚的问题必须询问，禁止模糊工作。
* 用户暂定采用“归档前端 PRD 的模型服务页设计，并保留当前真实 API 接入”作为还原方向。
* 用户明确要求不要新增功能，因此本任务必须区分“还原已有/已设计能力”和“新增产品能力”。
* 用户曾要求在 A 方案（列式管理页）基础上添加启用/禁用按钮，并说明这是之前前端已有功能；随后用户修正为完成后隐藏启用/禁用按钮。
* 用户明确要求去除模型服务列表中的密钥列。
* 用户确认：列表不展示密钥列或 masked key；配置/编辑弹窗仍保留 API Key 输入。
* 用户确认：配置/编辑页面也隐藏启用/禁用相关控件；最终页面不提供启用/禁用操作入口。
* 用户确认：列表状态列也隐藏。
* 用户已确认最终设计，可以进入实现阶段。
* 当前页面入口是 `src/apps/web/src/app/providers/page.tsx`，渲染 `AdminListPage kind="providers"`。
* 当前 Provider 页面实现集中在 `src/apps/web/src/features/admin/admin-list-page.tsx`、`provider-config-dialog.tsx` 和 `provider-hooks.ts`。
* 当前前端已接入真实 API：`GET /api/providers`、`GET /api/providers/public-key`、`PUT /api/providers/:kind`。
* 当前 Provider 页面使用 TanStack Query，保存时会先获取传输公钥并用 RSA-OAEP 加密 API Key；空 API Key 表示保留原密钥。
* 最近提交 `5645550 feat: add model provider configuration` 已加入模型服务后端 API、数据库字段、前端 hooks 和基础 `/providers` 页面。
* 归档前端 PRD 要求模型服务页只保留三类模型：chat、embedding、rerank。
* 归档前端 PRD 要求密钥永不明文展示，只展示掩码或安全元数据。
* 归档前端 PRD 中的模型服务页面原设计包含列：模型服务类型、显示名称、Provider、模型 ID、Base URL、状态、密钥掩码、更新时间、行操作。
* 本任务按用户修正去除列表密钥列，不在列表中展示 masked key。
* 归档前端 PRD 中的模型服务页面原设计包含筛选：configured/missing 状态、Provider、display/model 搜索、按 updated/name/kind 排序。
* 归档前端 PRD 中的模型服务页面原设计包含 Drawer：配置摘要、状态、密钥元数据、key version、创建/更新时间、近期审计摘要。
* 当前可执行契约测试写过“模型服务页面不提供独立启停按钮”，最终需求继续保持该约束。
* 当前真实 Provider 保存 API 支持 `status: enabled | disabled`，但本任务不在 UI 暴露启用/禁用操作，也不展示状态列。

## Assumptions (temporary)

* “还原”暂定指将当前简化的 `/providers` 页面恢复到归档前端 PRD 中定义、且当前真实 API 能支撑的页面形态。
* 还原应保留最近后端 API 接入成果，而不是回退到纯 mock/localStorage 状态。
* 本任务不新增后端接口、数据模型、模型种类、Provider 种类或新的业务动作。
* 如果原设计与当前真实 API 能力冲突，需由用户确认取舍后再进入实现。

## Open Questions

* None.

## Requirements (evolving)

* 页面必须继续作为 admin-only 页面存在于 `/providers`。
* 页面必须继续围绕固定三类模型服务：chat、embedding、rerank。
* 页面不得展示 plaintext API Key、加密 payload 或原始 Provider 错误。
* 新增/首次配置必须要求 API Key；编辑时 API Key 留空表示保持原密钥。
* 配置/编辑弹窗保留 API Key 输入；“去除密钥列”仅作用于列表列展示，列表不得展示 masked key。
* 配置/编辑弹窗不得展示状态选择、启用/禁用开关或启用/禁用按钮。
* 列表不得展示状态列。
* 保存配置必须继续走现有 API hooks，并保留保存时自动连接测试的行为。
* 列表行不得提供启用/禁用按钮；已配置行提供编辑入口，未配置行提供配置入口。
* 页面不得引入备用模型、设为默认或独立 key rotation 动作。
* 页面不得为了满足归档 PRD 而新增当前后端没有的业务动作。
* 本任务只还原当前 API 已支持且本轮确认保留的能力：三类模型槽位、配置/编辑、保存并测试、密钥加密提交、安全摘要展示。
* 列表展示字段限定为：模型服务类型/名称、Provider、模型 ID、Base URL、更新时间、操作。
* 当前 API/页面能力之外的项不纳入本任务：删除配置、审计摘要 drawer、复杂筛选/排序。

## Acceptance Criteria

* [x] `/providers` 渲染模型服务配置页面，而不是占位或不完整状态。
* [x] 页面展示 chat、embedding、rerank 三个固定模型服务槽位，包括已配置和未配置槽位。
* [x] 页面列表展示 Provider、模型 ID、Base URL、更新时间和操作，不展示密钥列、masked key 或状态列。
* [x] 管理员可以配置或编辑每个模型服务，并通过现有 Provider API 保存。
* [x] 页面列表和配置/编辑弹窗都不展示启用/禁用操作入口或状态控件。
* [x] 保存时不会把 plaintext API Key 放入普通组件状态之外的持久展示、日志、URL 或响应 UI。
* [x] 加载、空状态、错误状态和保存错误都有明确中文反馈。
* [x] 本任务不新增 Provider 后端接口、模型种类、Provider 种类或新的业务动作。
* [x] 前端测试覆盖 Provider 页面关键行为和 API hook 请求构造。

## Definition of Done (team quality bar)

* Tests added/updated (unit/integration where appropriate).
* Lint / typecheck / CI green for touched packages.
* Docs/notes updated if behavior changes.
* Rollout/rollback considered if risky.

## Out of Scope (explicit)

* 不做备用模型、多模型优先级、设为默认 Provider。
* 不做启用/禁用 UI 操作入口。
* 不展示模型服务状态列或状态表单控件。
* 不做独立 key rotation 动作。
* 不新增后端 delete provider config 接口或其它 Provider 管理接口。
* 不还原删除配置动作。
* 不还原审计摘要 drawer。
* 不还原复杂筛选/排序。
* 不展示 plaintext secret、encrypted payload 或 raw provider error。
* 不扩展新的 Provider 种类或模型种类，除非用户后续明确要求。

## Technical Notes

* Current task directory: `.trellis/tasks/05-24-restore-model-config-page`.
* Relevant frontend files:
  * `src/apps/web/src/app/providers/page.tsx`
  * `src/apps/web/src/features/admin/admin-list-page.tsx`
  * `src/apps/web/src/features/admin/admin-list-layout.ts`
  * `src/apps/web/src/features/admin/provider-config-dialog.tsx`
  * `src/apps/web/src/features/admin/provider-hooks.ts`
  * `src/apps/web/src/features/admin/provider-hooks.test.ts`
  * `src/apps/web/src/copy/admin.ts`
  * `src/apps/web/src/features/shell/prd-contract.test.ts`
* Relevant backend/API contract files:
  * `src/apps/api/src/contracts/rpc.ts`
  * `src/apps/api/src/modules/providers/router.ts`
  * `src/apps/api/src/modules/providers/procedures/list-providers.ts`
  * `src/apps/api/src/modules/providers/procedures/save-provider.ts`
  * `src/packages/ai-providers/src/index.ts`
  * `src/packages/ai-providers/src/service.ts`
* Relevant prior planning docs:
  * `.trellis/tasks/archive/2026-05/05-15-frontend-page-design/prd.md`
  * `docs/superpowers/plans/2026-05-23-model-service-backend-api.md`
  * `docs/superpowers/specs/2026-05-12-knowledge-base-ai-assistant-design.md`

## Implementation Notes

* Added `src/apps/web/src/features/admin/provider-page-view.ts` to keep Provider list display fields and hidden save status behavior testable without importing TSX components in Vitest.
* Updated `/providers` to use a fixed column layout with type/name, Provider, model ID, Base URL, updated time, and action only.
* Removed status controls from the Provider config dialog while preserving the backend-required `status` value as hidden submit data.
* Switched Provider dialog labels to `modelServiceKindLabels` from `@kb/ai-providers`, removing production runtime dependence on mock admin helpers for these labels.

## Verification

* `pnpm --filter @kb/web lint`
* `pnpm --filter @kb/web typecheck`
* `pnpm --filter @kb/web test`
* `pnpm --filter @kb/web build`
* `node .tmp/verify-provider-page.mjs`
