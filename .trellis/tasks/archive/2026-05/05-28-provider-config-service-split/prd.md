# 拆分模型服务 Provider 配置模块

## Goal

将 `src/packages/ai-providers/src/service.ts` 和对应测试按职责拆分，降低单文件复杂度，同时保持现有模型服务配置、连接测试、Embedding 调用、密钥加密/轮换、repository、审计和对外导出行为不变。

## What I already know

* 用户明确要求创建 Trellis 任务，并在开始实现前再次明确影响范围；不清楚的决策必须先问，不能模糊开始任务。
* 当前任务目录：`.trellis/tasks/05-28-provider-config-service-split`。
* 当前 Git 状态在任务创建前为 clean，当前分支为 `feat/user-chat-page`。
* 主要超长文件：
  * `src/packages/ai-providers/src/service.ts`：1487 行。
  * `src/packages/ai-providers/src/service.test.ts`：599 行。
* `@kb/ai-providers` 当前 package exports 包含：
  * `"."` -> `./src/index.ts`
  * `"./runtime"` -> `./src/runtime.ts`
  * `"./service"` -> `./src/service.ts`
* 现有消费者直接依赖 `@kb/ai-providers/service`：
  * `src/apps/api/src/runtime/services.ts`
  * `src/apps/worker/src/index.ts`
  * `src/packages/ingestion/src/index.ts` 使用 `EmbeddingServiceResult` 类型。
* API、worker、ingestion、admin UI 都受 Provider contract 间接影响，因此本任务默认做行为保持型拆分。

## Impact Scope

### In scope

* 拆分 `src/packages/ai-providers/src/service.ts` 内部职责，保留 `src/packages/ai-providers/src/service.ts` 作为兼容导出入口。
* 拆分或重组 `src/packages/ai-providers/src/service.test.ts`，使测试跟随新模块边界。
* 只修改 `src/packages/ai-providers` 内必要文件；如 TypeScript 导出需要，允许小范围调整 package 内 barrel。
* 保留现有 public API 名称、参数、返回结构和错误码：
  * `createProviderConfigService`
  * `createEmbeddingService`
  * `createProviderConnectionTester`
  * `createInMemoryProviderConfigRepository`
  * `createDrizzleProviderConfigRepository`
  * 已导出的 service 相关 interfaces/types。
* 保持 `@kb/ai-providers/service` import 路径可用，不要求 API、worker、ingestion 消费者批量改 import。
* 保持密钥加密 payload、AAD、masked key、keyVersion 轮换、审计 metadata、provider endpoint URL 构造、DashScope/DeepSeek 特例行为不变。
* 保持现有测试语义，并按拆分后的模块补充或移动测试。

### Out of scope

* 不新增 provider 类型、模型能力或 vendor SDK。
* 不修改 DB schema、migration、provider config 表结构或 secret record 表结构。
* 不改变 API HTTP contract、Hono RPC contract、前端 provider UI 行为。
* 不改变 runtime wiring 的依赖注入语义。
* 不解决其它历史边界问题，例如 API service contract 是否还应引用 server-only provider service type；除非拆分时 TypeScript 必须处理。
* 不做性能优化、重试策略调整、timeout 默认值调整或错误文案调整。

## Proposed Module Boundaries

推荐拆分为以下文件，最终命名可按现有风格微调：

* `src/packages/ai-providers/src/service.ts`
  * 保留为兼容入口，只 re-export 新模块的 public contract。
* `src/packages/ai-providers/src/shared/service-types.ts`
  * Provider config actor/record/repository/service/options/error 类型。
  * Embedding service 类型和结果类型。
  * Connection tester 输入/结果类型。
* `src/packages/ai-providers/src/shared/provider-service-errors.ts`
  * Provider config service 错误映射和 abort 判断。
* `src/packages/ai-providers/src/provider-config/provider-config-service.ts`
  * `createProviderConfigService`、保存流程、列表 summary、审计事件选择。
* `src/packages/ai-providers/src/provider-config/provider-config-summary.ts`
  * Provider config summary 映射。
* `src/packages/ai-providers/src/provider-config/provider-secrets.ts`
  * API key decrypt/encrypt、secret metadata、AAD、key version、masked key handling。
* `src/packages/ai-providers/src/embedding/embedding-service.ts`
  * `createEmbeddingService`、embedding request/response parsing、provider error mapping。
* `src/packages/ai-providers/src/connection/connection-tester.ts`
  * `createProviderConnectionTester`、provider connection request 构造、HTTP status normalization。
* `src/packages/ai-providers/src/provider-http/provider-endpoints.ts`
  * URL/path normalization、DashScope/DeepSeek/provider identity 判断。
* `src/packages/ai-providers/src/repositories/provider-repository-memory.ts`
  * `createInMemoryProviderConfigRepository`。
* `src/packages/ai-providers/src/repositories/provider-repository-drizzle.ts`
  * `createDrizzleProviderConfigRepository`、row mappers。
* `src/packages/ai-providers/src/runtime.ts`
  * 保留为兼容入口，只 re-export runtime adapter。
* `src/packages/ai-providers/src/runtime/runtime-service.ts`
  * Chat/rerank runtime adapter 实现。
* `src/packages/ai-providers/src/testing/service.test-helpers.ts`
  * 共享测试 fixtures 和 fetch mocks。

## Requirements

* 拆分后 `src/packages/ai-providers/src/service.ts` 不再承载大段实现，目标是入口文件低于 200 行。
* 单个新实现文件应尽量低于 400 行；如某文件接近 400 行，需要重新评估边界。
* 拆分后的模块之间不能形成循环 import。
* 不允许引入 `any`、非空断言、`@ts-ignore` 或未使用导出。
* 不允许泄露原始 API Key、provider response body、密钥密文以外的敏感信息到日志、审计、测试快照或响应结构。
* 不允许改变已公开的 `@kb/ai-providers` package exports。

## Acceptance Criteria

* [x] `src/packages/ai-providers/src/service.ts` 保留兼容导出，现有消费者 import 不需要改动即可 typecheck。
* [x] Provider config service 行为与现有测试覆盖一致：首次保存必须提供 key、连接失败不写库、同 key 不轮换、不同 key 轮换 metadata。
* [x] Connection tester 行为与现有测试覆盖一致：DeepSeek models endpoint、DashScope native embedding/rerank、失败 status 映射不泄露 provider body。
* [x] Embedding service 行为与现有测试覆盖一致：未配置/禁用失败，OpenAI-compatible embedding 返回 provider/model/vector metadata。
* [x] 相关测试按模块拆分后仍覆盖原测试场景。
* [x] `pnpm --filter @kb/ai-providers test` 通过。
* [x] `pnpm --filter @kb/ai-providers typecheck` 通过。
* [x] 如修改跨包导出，运行必要的上层 typecheck 或 targeted tests 验证 API/worker/ingestion 消费者不受影响。

## Definition of Done

* PRD 影响范围经用户确认。
* 代码完成职责拆分且 public API 兼容。
* Relevant tests/typecheck/lint 通过，或明确记录无法运行的阻塞原因。
* 如发现新的项目级约定或坑点，评估是否需要更新 `.trellis/spec/`。
* 提交前按项目流程给出 commit plan。

## Open Questions

* 已确认：本任务采用“行为保持型拆分”。只拆 `@kb/ai-providers/service` 内部实现和对应测试，不主动改 API/worker/ingestion/web 消费者 import，也不处理其它 provider contract 清理。
* 已确认：保持当前功能，禁止增删功能。

## Technical Notes

* `src/packages/ai-providers/package.json` 当前只暴露 root、runtime、service 三个 subpath；兼容策略应优先保持 exports 不变。
* 直接消费者：
  * API runtime 创建 provider config service、connection tester、embedding service、provider repository。
  * Worker 创建 embedding service 和 drizzle provider repository。
  * Ingestion 只引用 `EmbeddingServiceResult` 类型。
* 相关规格：
  * `.trellis/spec/backend/ai-provider.md`
  * `.trellis/spec/backend/package-boundaries.md`
  * `.trellis/spec/backend/database.md`
  * `.trellis/spec/backend/audit.md`
  * `.trellis/spec/shared/typescript.md`
  * `.trellis/spec/shared/code-quality.md`
  * `.trellis/spec/testing/strategy.md`
  * `.trellis/spec/guides/code-reuse-thinking-guide.md`
  * `.trellis/spec/guides/cross-layer-thinking-guide.md`
