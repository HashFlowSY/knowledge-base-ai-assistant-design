# 拆分文档上传后端链路

## Goal

将文档上传后端链路中的超长文件按功能拆分到明确的子目录中，降低单文件复杂度，同时保持现有 API 契约、数据库 schema、队列 payload、对象存储行为、审计行为和错误响应不变。

## What I Already Know

* 用户明确要求创建 Trellis 任务并完成“文档上传后端链路”的拆分。
* 开始实现前必须再次明确影响范围；不清楚的决策需要直接询问，不能模糊开始。
* 拆分后的文件必须按功能归并到相应文件夹中，不能把拆分文件直接放在模块根目录下。
* 当前文档上传后端链路的大文件包括：
  * `src/packages/knowledge/src/operations/upload-document-file.ts`：778 行，service 层上传编排。
  * `src/apps/api/src/modules/documents/procedures/upload-document-file.test.ts`：546 行，API 上传 procedure 测试。
* API procedure 实现本身已经有 `lib/` 子目录：
  * `file-validation.ts`
  * `upload-request.ts`
  * `upload-audit.ts`
  * `upload-concurrency.ts`
* service 层入口由 `src/packages/knowledge/src/service.ts` 调用 `uploadDocumentFileOperation`。
* 上传成功结果契约来自 `documentFileUploadResultSchema`，被 API、web upload hook、queue payload 创建共同依赖。

## Confirmed Impact Scope

### In Scope

* 拆分 `src/packages/knowledge/src/operations/upload-document-file.ts` 到功能子目录：
  * `src/packages/knowledge/src/operations/upload-document-file/`
  * 保留或恢复 `uploadDocumentFileOperation` 作为 service 层唯一公开入口。
* 拆分 API 上传测试到功能子目录：
  * `src/apps/api/src/modules/documents/procedures/upload-document-file/`
  * 按认证/限流/请求校验/成功与重复/并发等行为归组。
* 如有必要，调整 import 路径和 package barrel，但保持外部行为不变。
* 增加一个轻量结构/契约测试，先红后绿，约束后续拆分不回退为单个超长上传 operation 文件。
* 运行相关 package 测试、typecheck、lint 或可承受的等价子集。

### Out of Scope

* 不改数据库 schema 和 Drizzle migration。
* 不改 `DocumentFileUploadResult` 响应结构。
* 不改上传 API 路由、HTTP status、错误 code/message、rate-limit 语义。
* 不改对象存储 key 规则、bucket 配置、cleanup 策略的业务语义。
* 不改 ingestion queue payload 格式。
* 不改前端 workspace upload hook 或 UI。
* 不做 document upload 以外的 knowledge-base CRUD 重构。

## Functional Boundaries

### Knowledge Package Service Layer

Target directory:
`src/packages/knowledge/src/operations/upload-document-file/`

Planned functional directories:

* `index.ts`：保留 `uploadDocumentFileOperation` 编排入口。
* `access/`：授权与权限校验，如 `authorizeUpload`。
* `metadata/`：上传 metadata reservation 与结果查询，如 `reserveUploadMetadata`、`findExistingUploadResult`、`findUploadResultBySourceId`。
* `lifecycle/`：上传完成、队列入队、失败状态与对象清理，如 `finalizeUpload`、`enqueueFinalizedUpload`、`markReservedUploadFailed`。
* `observability/`：审计和失败日志，如 `writeUploadAudit`、`logUploadFailure`。
* `shared/`：上传内部类型和常量，如 `UploadInput`、`UploadResult`、document version、内部错误 code。

### API Documents Test Layer

Target directory:
`src/apps/api/src/modules/documents/procedures/upload-document-file/`

Planned functional directories:

* `guards/`：未登录、非法 origin、unsupported content type 的未解析身份限流、已登录上传限流。
* `validation/`：content-length、multipart、文件类型/签名校验、安全审计。
* `responses/`：成功上传、title fallback、重复上传成功 envelope。
* `concurrency/`：actor/tenant concurrency limiter 行为。
* `support/`：测试 request/file/result/auth helpers。

## Requirements

* 拆分文件必须位于功能子目录内，而不是直接散落在 `operations/` 或 `procedures/` 根目录。
* 拆分前后 public API 保持稳定：
  * `createKnowledgeBaseService(...).uploadDocumentFile(...)` 行为不变。
  * API route `/api/knowledge-bases/:knowledgeBaseId/documents/upload` 行为不变。
* 拆分应主要移动私有函数；跨文件共享只暴露内部模块需要的最小接口。
* 命名必须表达功能边界，避免 `helpers.ts` 承载核心业务逻辑。
* 测试拆分后，每个测试文件只覆盖一个上传行为域。
* 不引入新依赖。

## Acceptance Criteria

* [x] `src/packages/knowledge/src/operations/upload-document-file.ts` 不再作为 400+ 行业务实现文件存在；上传实现被归并到 `operations/upload-document-file/` 子目录。
* [x] API upload procedure 测试被拆到 `procedures/upload-document-file/` 子目录，并按行为域归组。
* [x] 文档上传相关测试通过。
* [x] `@kb/knowledge` 和 `@kb/api` typecheck 通过，或如有环境限制，记录准确失败原因。
* [x] 没有改变 document upload API 响应 schema、错误 code、限流 scope、审计字段、队列 payload。
* [x] 不修改数据库 migration/schema。

## Definition of Done

* Tests added/updated where needed.
* Relevant lint/typecheck/tests run with fresh output.
* Trellis check run before completion.
* Spec update reviewed;只有确有新增项目规范时才修改 `.trellis/spec/`。
* 提交前给出 commit plan，不自动包含非本任务变更。

## Open Question

* 已确认。用户回复“确认执行”后开始实现。

## Implementation Result

* `src/packages/knowledge/src/operations/upload-document-file.ts` 已收敛为兼容入口，实际实现拆分到 `operations/upload-document-file/` 子目录。
* service 层按 `access/`、`metadata/`、`lifecycle/`、`observability/`、`shared/` 功能子目录分组。
* API upload procedure 测试拆分到 `procedures/upload-document-file/` 子目录，再按 `guards/`、`validation/`、`responses/`、`concurrency/`、`support/` 功能子目录收拢。
* 新增 `operations/upload-document-file/structure.test.ts`，约束上传实现保持功能目录拆分，避免回退为超长单文件。
* 拆分后的目标目录内最大文件为 194 行，低于 400 行。

## Verification

* `pnpm --filter @kb/knowledge test -- src/operations/upload-document-file/structure.test.ts`
* `pnpm --filter @kb/knowledge typecheck`
* `pnpm --filter @kb/api test -- src/modules/documents/procedures/upload-document-file`
* `pnpm --filter @kb/api typecheck`
* `pnpm --filter @kb/knowledge test`
* `pnpm --filter @kb/api test`
* `pnpm --filter @kb/knowledge lint`
* `pnpm --filter @kb/api lint`
* `pnpm typecheck`
* `pnpm lint`
* `pnpm test`
* `git diff --check`

## Technical Notes

* `tsconfig.base.json` 使用 `moduleResolution: "Bundler"`，目录 `index.ts` import 可被 TS 解析，但为降低运行时/工具差异，内部 import 可显式指向子文件。
* `src/packages/knowledge/src/service.ts` 是 knowledge service 的装配入口。
* `src/apps/api/src/modules/documents/procedures/upload-document-file.ts` 已经比较聚焦，当前不作为主要拆分目标，主要拆其测试文件。
* `src/apps/api/src/modules/documents/lib/*` 已承担 API 层 request/file/audit/concurrency helper，不应把 service 层业务逻辑移动到 API package。
