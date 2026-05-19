# 修复认证会话错误码与审计限流问题

## Goal

修复真实认证、session gate、用户管理鉴权和限流实现中与 PRD/规范不一致的高风险缺陷，确保 default tenant 配置错误、用户访问权错误、session 查询错误、启动配置错误、Redis 限流和 admin 越权审计都按契约表现。

## What I Already Know

- 本任务是对进行中任务 `05-18-user-auth-and-management` 的缺陷修复，不重新设计完整认证/用户管理范围。
- `src/packages/users/src/service.ts` 的 `resolveDefaultTenant` 当前在 default tenant 缺失和重复时都返回 `null`；`resolveSessionPayload` 已有 `default_tenant_unavailable` reason，但现有 API/测试里仍存在把 `null` 当成访问权缺失的兼容路径风险。
- `src/apps/api/src/auth-service.ts` 已围绕 `resolveSessionPayload` 映射 `UNAUTHORIZED`、`FORBIDDEN`、`INTERNAL_ERROR`，但类型仍允许 `ResolveSessionPayload` 返回 `null`，这会把 default tenant 配置错误与 membership 缺失混在同一信号里。
- `src/apps/api/src/app.ts` 的 `/api/auth/session` 必须保留 auth service 返回的 `code` 与 `httpStatus`，不能出现 `403/500 + UNAUTHORIZED` 的 envelope。
- `src/apps/web/src/features/shell/app-shell.tsx` 当前只使用 `sessionQuery.data ?? null`，没有区分 query error；这会把 `FORBIDDEN`、`INTERNAL_ERROR`、`RATE_LIMITED` 等 session 查询失败都当成未登录并跳 `/login?redirectTo=...`。
- `src/apps/api/src/app.ts` 的默认 app 创建路径当前捕获 runtime 初始化错误后退回 `createApiApp()`，生产环境配置错误会静默启动一个未认证 fallback app。
- `src/apps/api/src/rate-limit.ts` 的 Redis store 当前用 `get` 后 `psetex` 做读改写；同一 key 并发时会丢增量。
- `src/apps/api/src/app.ts` 的 admin guard 当前对 member 调用 `/api/users*` 返回 `FORBIDDEN`，但没有写 PRD 要求的 `auth.forbidden` audit event。
- `src/apps/web/src/features/api/client.ts` 当前是通用 `fetch` wrapper，auth/users hooks 再用 Zod parse envelope；这能运行，但不满足“项目包装的 Hono RPC typed client”契约。
- 相关规范：`.trellis/spec/backend/api-contract.md` 要求统一 response envelope、`httpStatus` body 与实际 status 一致、前端尽量使用 Hono RPC typed client；`.trellis/spec/backend/audit.md` 要求 forbidden admin attempts 写审计；`.trellis/spec/backend/security.md` 要求 default tenant 不特殊跳过、限流在 API 服务端执行；`.trellis/spec/frontend/state-management.md` 要求 session/auth state 由 API/auth 响应驱动。

## Requirements

- Default tenant 配置错误必须和用户访问权缺失分离：
  - default tenant 缺失或 `tenants.is_default=true` 不唯一是服务端配置/seed 错误，`POST /api/auth/login` 和 `GET /api/auth/session` 都必须返回 HTTP `500` + `code=INTERNAL_ERROR` + 安全文案 `操作失败，请稍后重试。`。
  - default tenant 存在但用户 membership 缺失或 inactive 才是访问权问题，必须返回 HTTP `403` + `code=FORBIDDEN` + `当前账号无权访问默认租户，请联系管理员。`。
  - 不再用 `null` 同时表示 default tenant 配置错误和 membership 缺失；类型和测试要让这两类错误不可被误映射。
- `/api/auth/session` 错误 envelope 必须保持一致：
  - 实际 HTTP status、body `httpStatus`、body `code` 三者必须来自同一个 auth service result。
  - 不得把所有 session 失败固定成 `UNAUTHORIZED`。
  - `UNAUTHORIZED`、`FORBIDDEN`、`INTERNAL_ERROR`、`RATE_LIMITED` 都要保持可区分，供前端 session gate 判断。
- 前端 session gate 必须把 session 查询错误映射成明确 auth state：
  - `UNAUTHORIZED`：视为未登录，跳 `/login?redirectTo=<internal-path>`。
  - `FORBIDDEN`：视为 no-default-tenant-access，清理/失效当前 session cache，跳 `/login`，不保留 `redirectTo`；不得把用户带回受保护页循环。
  - `INTERNAL_ERROR` 或 `RATE_LIMITED`：渲染安全错误状态或保持受保护内容不渲染，不跳登录页，不展示 raw exception。
  - pending session query 仍只渲染 skeleton/loading，不渲染受保护 children。
- API runtime 初始化必须 fail fast：
  - server entry 的生产路径不得吞掉 `createApiRuntimeServicesFromEnv(process.env)` 的配置/连接初始化错误并回退空 app。
  - 单元测试和显式 `createApiApp()` 仍可创建 fallback app 以便 isolated route tests。
  - 如需保留测试便利，fallback 只能由测试代码显式调用，不能在默认 production export 中静默发生。
- Redis rate limiter 必须使用原子计数：
  - 同一 Redis key 并发 `increment` 不得丢增量。
  - 可使用 Redis Lua 脚本或等价原子操作；必须保留固定窗口语义、`resetAt`、TTL = window + buffer、key 格式和不泄漏 raw identifier 的规则。
  - in-memory store 可保持当前测试友好的实现。
- member 调用 admin user-management API 必须写 `auth.forbidden` audit event：
  - 覆盖所有 `/api/users*` admin-only route。
  - 事件必须包含 `tenantId`、`actorId`、`actorType=user`、`action=auth.forbidden`、`targetType`、`targetId`、`requestId`、安全 metadata、IP/user-agent 摘要（可用时）。
  - 审计失败应按安全敏感操作处理；不得只返回响应状态而完全丢弃 required audit event。
- 前端内部 API 调用必须迁移到项目包装的 Hono RPC typed client：
  - `src/apps/api` 继续导出 route type。
  - `src/apps/web` 的 auth/users hooks 应通过 Hono RPC typed client 调用同源 `/api` 路径。
  - 前端不重新定义 API response 类型；必要的 Zod parse 只能作为 runtime boundary 校验，不替代 RPC 类型保护。

## Acceptance Criteria

- [ ] 测试覆盖 default tenant 缺失和重复时 `login` / `session` 返回 `INTERNAL_ERROR`，membership 缺失/inactive 返回 `FORBIDDEN`。
- [ ] 测试覆盖 `/api/auth/session` 对 `FORBIDDEN`、`INTERNAL_ERROR`、`RATE_LIMITED` 保留正确 HTTP status、body `httpStatus` 和 `code`。
- [ ] 前端测试覆盖 app shell/session gate 对 `UNAUTHORIZED`、`FORBIDDEN`、`INTERNAL_ERROR`、`RATE_LIMITED` 的不同处理；`FORBIDDEN` 不带 `redirectTo` 跳登录，server error/rate limit 不跳登录。
- [ ] 测试覆盖默认 API app/runtime 初始化在配置错误时 fail fast，不回退未认证 empty app；isolated `createApiApp()` 测试仍可使用 fallback services。
- [ ] Redis rate-limit store 有原子并发计数测试或脚本行为测试，能证明同一 key 并发 increment 后 count 不被低估。
- [ ] 测试覆盖 member 请求 `/api/users*` 返回 `FORBIDDEN` 且写入 `auth.forbidden` audit event；domain user service 不被调用。
- [ ] 前端 auth/users hooks 通过项目 Hono RPC typed client 调用内部 API；相关类型来自 API route type 或共享 contract，不靠 raw fetch path 字符串作为唯一契约。
- [ ] `pnpm --filter @kb/api test`、`pnpm --filter @kb/web test`、相关 package typecheck/lint 命令通过；如果范围调整，最终说明实际执行的命令。

## Definition of Done

- Tests added/updated for each repaired contract.
- Lint/typecheck/test verification run for touched packages.
- No unrelated dirty work is reverted or committed accidentally.
- No new raw secrets, stack traces, SQL details, session tokens, cookies, password hashes, or raw IPs are exposed in response bodies, Redis keys, audit metadata, or frontend errors.
- Spec update reviewed; if current specs already cover the behavior, document that no spec change was required.

## Out of Scope

- 不重新实现完整用户管理或 auth migration，只修复本任务列出的缺陷。
- 不新增全局 API error code；继续使用 `UNAUTHORIZED`、`FORBIDDEN`、`INTERNAL_ERROR`、`RATE_LIMITED` 等现有标准 code。
- 不新增多租户选择、租户切换、Next middleware 或 SSR route guard。
- 不改变 auth/user-management 的产品路径；仍使用同源 `/api/...`。

## Technical Notes

- Likely backend files: `src/packages/users/src/service.ts`, `src/apps/api/src/auth-service.ts`, `src/apps/api/src/app.ts`, `src/apps/api/src/runtime-services.ts`, `src/apps/api/src/server.ts`, `src/apps/api/src/rate-limit.ts`, and their tests.
- Likely frontend files: `src/apps/web/src/features/api/client.ts`, `src/apps/web/src/features/auth/auth-hooks.ts`, `src/apps/web/src/features/admin/user-hooks.ts`, `src/apps/web/src/features/shell/app-shell.tsx`, and related tests.
- Existing task PRD reference: `.trellis/tasks/05-18-user-auth-and-management/prd.md`, especially session error mapping, frontend gate behavior, Hono RPC typed client, audit events, and rate-limit policy.
