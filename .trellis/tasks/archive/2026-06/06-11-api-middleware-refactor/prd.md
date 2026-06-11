# API middleware refactor

## Goal

将 `src/apps/api` 中重复的后端接口横切逻辑改造成明确的 Hono middleware 并在 router 层挂载，让 procedure 聚焦输入解析、业务服务调用和响应映射，同时保持现有 API envelope、状态码、限流、审计和 cookie 行为不回退。

## What I Already Know

* 项目后端 API 位于 `src/apps/api`，不是顶层 `api/` 目录。
* `createApiApp` 已有全局 request context middleware，负责 `requestId`、request logger、`X-Request-Id` 和完成日志。
* 当前 typed context 只有 `logger` 和 `requestId`；后端规范要求 middleware 附加 `session`、`actor`、`tenantId`。
* users、knowledge-bases、documents、chat、providers 多个 procedure 顶部重复调用 session/admin guard、mutation guard、rate limit helper。
* routers 当前只做路径到 procedure 的转发，没有挂载 domain-level middleware。
* `validateMutationRequest` / `validateJsonMutationRequest` 已接近 middleware 逻辑，但目前由 handler 手动调用。
* chat 的 POST routes 直接 `context.req.json()`，缺少与其他 mutation route 一致的 origin/content-type guard。
* 若 `schema.parse(...)` 抛出 ZodError，当前全局 `app.onError` 会按 unhandled error 映射成 `INTERNAL_ERROR`；这不符合 validation error contract。
* 文件上传接口包含一段明显 pre-handler 逻辑：mutation guard、multipart content-type、session、upload rate limit、upload concurrency acquire/release；但 multipart 字段解析、文件安全校验、checksum 和 document service 调用仍是上传流程本身。

## Assumptions

* 不新增第三方依赖，沿用 Hono middleware 和现有 helper。
* 不改变 Hono RPC route keys、请求/响应 schema 语义和 public API 路径。
* 不把知识库/文档/聊天的对象级权限挪到 generic middleware；service/domain 仍负责具体资源权限和 tenant-owned 数据过滤。
* 这次允许修正明显不一致的 validation error 映射，例如 query/body ZodError 返回 400 而不是 500。
* 这次允许把 chat POST 纳入同一套 mutation/content-type guard，因为它是当前建议中发现的安全一致性缺口。

## Requirements

1. 扩展 `ApiContextVariables`
   * 增加 nullable `session`、`actor`、`tenantId`。
   * 增加必要的 internal context flag，例如 `rateLimitCounted`，用于保证一个请求最多消费一个 limiter key。
   * request context middleware 初始化这些变量，protected middleware 负责收窄或写入。

2. 新增或整理 API middleware 工厂
   * `requestContextMiddleware`：保留现有 `requestId/logger/X-Request-Id/request finished log` 行为，可从 `app.ts` 移出或保持入口内但结构清晰。
   * `jsonMutationGuard` / `mutationGuard`：处理 allowed origin、`sec-fetch-site`、JSON content-type 或 no-body mutation 约束。
   * `requireSessionMiddleware`：读取 cookie、调用 `authService.getSession`、转发 auth service 返回的 `Set-Cookie`、写入 actor/session/tenant context。
   * `requireAdminMiddleware`：基于 actor context 判断 admin role，失败时记录 forbidden audit 并返回标准 error envelope。
   * `rateLimitMiddleware` 或同等 factory：支持 login、auth session、knowledge-base、user-management、document-upload 的 IP / session / actor identity，并保留 `Retry-After` header。
   * `validateJsonBody(schema)` / `validateQuery(schema)` / optional `validateParams(schema)`：将解析结果放入 context 或通过明确 helper 读取，Zod 错误统一映射 `VALIDATION_ERROR`。
   * `documentUploadPreflightMiddleware` 或一组 route-specific middleware：覆盖 upload 的 mutation guard、multipart content-type、session、upload rate limit、actor/tenant concurrency acquire/release。

3. 在 router 层挂载中间件
   * `auth` routes：
     * login：JSON mutation guard + login rate limit；login handler 保留 login service 调用和 cookie 写回。
     * logout：mutation guard + auth session rate limit + no request body guard。
     * session：auth session rate limit。
   * `users` routes：
     * 全部 users routes：require admin user-management session/rate limit。
     * POST/PATCH：JSON mutation guard + body validation。
     * DELETE access：mutation guard + no request body guard。
   * `knowledge-bases` routes：
     * GET routes：require authenticated knowledge-base session/rate limit。
     * POST/PATCH：JSON mutation guard + require admin + body validation。
   * `documents` routes：
     * processing GET：require authenticated knowledge-base session/rate limit + query validation。
     * retry POST：JSON mutation guard + require authenticated session/rate limit + body/param validation。
     * upload POST：route-specific upload preflight middleware。
   * `chat` routes：
     * all chat routes：require authenticated knowledge-base session/rate limit。
     * POST routes：JSON mutation guard + body validation。
   * `providers` routes：
     * all provider routes：require admin knowledge-base session/rate limit。
     * PUT provider：JSON mutation guard + param/body validation。

4. Refactor procedures
   * Remove repeated top-of-handler guard boilerplate.
   * Procedures read actor/body/query/params from typed context helpers or middleware outputs.
   * Keep service calls explicit; do not pass raw Hono context into packages.
   * Keep response envelope via `createSuccessResponse` / `respondWithServiceError`.

5. Preserve behavior
   * `Set-Cookie` cleanup headers from auth service still reach the response on failed session/login/logout paths.
   * Unauthenticated or pre-auth failures that are currently rate-limited remain rate-limited.
   * A request consumes at most one limiter key.
   * Admin forbidden attempts still record audit before returning `FORBIDDEN`.
   * Document upload concurrency reservations are released with `finally` when downstream work finishes or fails.
   * Client-visible errors never expose stack traces, SQL details, provider secrets, prompt content, chunks, or raw upstream bodies.

## Acceptance Criteria

* [ ] Repeated session/admin/rate-limit/mutation guard logic is no longer hand-written in each affected procedure.
* [ ] Hono routers mount explicit middleware for auth, admin authorization, mutation guards, validation, rate limiting, and upload preflight where applicable.
* [ ] Context types include request-scoped auth fields required by backend specs.
* [ ] Chat POST routes reject invalid origin/content-type consistently with other JSON mutation routes.
* [ ] Zod validation failures at API boundaries return standard `VALIDATION_ERROR` envelopes instead of unhandled 500s.
* [ ] Existing API response envelope shape is preserved.
* [ ] Existing tests are updated and new tests are added for middleware behavior and representative route mounting.
* [ ] Project lint, typecheck, and relevant tests pass.

## Out Of Scope

* No API path changes.
* No frontend feature changes beyond whatever type updates are required by existing RPC contracts.
* No new auth provider, rate-limit backend, CORS package, or validation library.
* No generic object-level authorization middleware for knowledge-base/document/chat resource access.
* No rewrite of document file validation, provider key crypto, or domain package service logic.

## Technical Notes

* Relevant specs:
  * `.trellis/spec/backend/api-contract.md`
  * `.trellis/spec/backend/api-module.md`
  * `.trellis/spec/backend/security.md`
  * `.trellis/spec/backend/logging.md`
  * `.trellis/spec/backend/audit.md`
  * `.trellis/spec/backend/performance.md`
  * `.trellis/spec/shared/typescript.md`
  * `.trellis/spec/testing/index.md`
* High-impact source areas:
  * `src/apps/api/src/app.ts`
  * `src/apps/api/src/contracts/context.ts`
  * `src/apps/api/src/guards/**`
  * `src/apps/api/src/http/**`
  * `src/apps/api/src/modules/**/router.ts`
  * `src/apps/api/src/modules/**/procedures/**`
  * `src/apps/api/src/rate-limit/**`
* Current tests to preserve/update:
  * `src/apps/api/src/modules/auth/router.test.ts`
  * `src/apps/api/src/modules/users/router.test.ts`
  * `src/apps/api/src/modules/knowledge-bases/router.test.ts`
  * `src/apps/api/src/modules/providers/router.test.ts`
  * `src/apps/api/src/modules/chat/router.test.ts`
  * `src/apps/api/src/modules/documents/procedures/retry-document-processing.test.ts`
  * `src/apps/api/src/modules/documents/procedures/upload-document-file/**`
  * `src/apps/api/src/guards/mutation.test.ts`
  * `src/apps/api/src/http/error-handling.test.ts`

## Open Question

* Resolved: 用户确认按完整 router-level middleware 改造执行，包含 session/admin/rate-limit/mutation guard、body/query/params validation middleware/helper，以及 document upload preflight。

## Definition Of Done

* PRD 范围经用户确认。
* 任务进入 in_progress。
* 代码按 backend specs 实现。
* Lint/typecheck/relevant tests 通过。
* 如发现值得沉淀的新约定，更新 `.trellis/spec/`。
