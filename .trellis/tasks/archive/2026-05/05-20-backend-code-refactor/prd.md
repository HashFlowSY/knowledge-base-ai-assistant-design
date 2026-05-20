# 后端代码分层重构

## Goal

重构当前项目的后端代码组织，让声明、契约、路由装配、接口处理、服务逻辑、错误映射和辅助函数有更清晰的文件边界。此次任务只做结构拆分和导入路径调整，不修改现有业务逻辑，不新增功能。

## What I Already Know

* 用户希望开一个新任务，主要目的是重构当前项目的后端代码。
* 重构原因：当前单个文件内同时存在异常声明、逻辑实现等内容，分层不够清晰。
* 重构目的：拆分代码文件，让逻辑文件只放逻辑，接口声明文件只放接口声明，类似职责分别放入更聚焦的模块。
* 明确禁止：禁止修改逻辑，禁止增加功能。
* 项目是 TypeScript + pnpm monorepo，后端包括 `src/apps/api`、`src/apps/worker` 和 `src/packages/*` 中的后端包。
* Trellis backend 规范要求：
  * API handlers 负责 HTTP concerns、校验、鉴权、错误映射和 package orchestration。
  * Domain logic 属于 `src/packages/*`。
  * API routes 应按业务 domain 组织，schema、router、procedure/helper 分层清晰。
  * package root 对可被前端导入的包应保持 browser-safe，server-only 服务应通过明确 subpath 暴露。
* 当前后端体量和职责集中候选包括：
  * `src/apps/api/src/app.ts`：应用装配、健康检查 schema、认证路由处理、服务注入、rate limiter 初始化混在一个文件。
  * `src/apps/api/src/contracts.ts`：API context、服务接口、运行时 options、rate limiter/audit 接口、Hono RPC route schema 混在一个文件。
  * `src/apps/api/src/user-routes.ts`：用户 route 注册和多个 endpoint handler 放在同一文件。
  * `src/apps/api/src/auth-service.ts`：Better Auth service factory、login/logout/session 实现、cookie/sign-out helpers、错误映射 helper 在同一文件。
  * `src/packages/users/src/service.ts`：服务接口、服务工厂、查询/事务编排、审计、错误转换调用在同一文件，虽然已有部分 helpers 拆出。
  * `src/packages/users/src/index.ts`：browser-safe schema/type 与 domain plan helper、domain error schema 在同一 public entry 文件中。
  * `src/packages/db/src/seed-dev-auth.ts`：seed orchestration、repository interface、Postgres repository implementation、environment bootstrap 混在同一文件。
  * `src/packages/queue/src/index.ts`：queue schema、SSRF/private host 判断 helpers、URL schema、job payload schema、job id helper 混在同一 public entry 文件。
  * `src/packages/auth/src/server.ts`：server runtime、Better Auth adapter/export、cookie/header helper 等 server-only 关注点集中在一个文件。
  * `src/packages/observability/src/index.ts`、`src/packages/config/src/index.ts`、`src/packages/shared/src/index.ts` 当前体量较小，但如果存在 declaration 与 runtime helper 混杂，也可纳入轻量拆分。
  * `src/packages/db/src/schema/knowledge.ts` 和 `src/packages/db/src/schema/rag.ts` 行数较高，但主要是 Drizzle schema/table/index 声明；默认不因行数长而强拆，除非后续检查发现其文件职责已经影响维护。
* 近期已有任务 `05-19-split-large-files` 做过一次大文件拆分；本任务应聚焦后端分层语义，不做宽泛“大文件拆分”。

## Assumptions (Temporary)

* “后端代码”包括 `src/apps/api`、`src/apps/worker` 和 `src/packages/*` 内的后端/共享源码；本次任务范围明确囊括 package 内文件。
* 不按行数机械拆分所有 package 文件；优先处理职责混杂的 package 文件。纯声明型文件即使较长，也只有在职责边界确实不清时才拆分。
* 可接受的变化包括移动代码、拆文件、补充内部导出、调整 import/export、必要时重命名文件以表达职责。
* 不可接受的变化包括 API 路径/方法/status/response/error copy 变化、鉴权/限流/审计/数据库查询语义变化、schema 语义变化、测试断言行为变化。
* 如果拆分 public entry 会影响前端或其他包的 import，优先保持兼容 re-export；只有 PRD 后续明确批准时才迁移公共导入契约。
* 测试改动只用于跟随新文件边界和防止行为回归，不新增产品场景。

## Open Questions

* 是否同意采用“API app + packages 中职责混杂文件优先”的实施顺序，而不是一次性强拆所有 package 文件？

## Requirements (Evolving)

* 保持行为不变：禁止修改业务逻辑、接口契约、数据库语义、鉴权语义、错误文案和可观察行为。
* 拆分后的文件职责要清晰：
  * contract/type 文件只放类型、接口、schema 或 route contract 声明。
  * router 文件只负责 route 组合和挂载。
  * procedure/handler 文件只负责单个或小组 endpoint 的 HTTP 流程编排。
  * service 文件聚焦服务门面和领域编排，复杂事务步骤可拆到 operation/helper 文件。
  * error 文件只放错误类型、错误构造和映射。
  * helper/lib 文件只放 API-local 或 package-local 的纯辅助逻辑。
* 优先沿用 `.trellis/spec/backend/api-module.md` 推荐的 API module shape。
* 保持 package boundary：domain logic 不移入 API app，API app 不向 packages 传 Hono context。
* 保持 browser-safe package root：如果 `@kb/users` 仍被前端使用，root entry 不应 re-export server-only service。
* 避免循环依赖和过度 barrel；只在保持既有 public API 或表达模块边界时使用 re-export。
* 不引入新的 runtime dependency。
* 使用 pnpm 运行验证命令。

## Candidate Refactor Shape

### `src/apps/api`

Recommended target shape:

```text
src/apps/api/src/
├── app.ts                     # createApiApp facade and top-level route mounting
├── app-options.ts             # ApiAppOptions/runtime resource types if useful
├── contracts/
│   ├── context.ts             # ApiEnv and Hono context variables
│   ├── services.ts            # Auth/User/Audit/RateLimiter service interfaces
│   └── rpc.ts                 # Hono RPC route schema and ApiApp type
├── modules/
│   ├── health/
│   │   ├── types.ts
│   │   └── router.ts
│   ├── auth/
│   │   ├── router.ts
│   │   ├── procedures/login.ts
│   │   ├── procedures/logout.ts
│   │   └── procedures/session.ts
│   └── users/
│       ├── router.ts
│       └── procedures/*.ts
└── services/auth/
    ├── better-auth-service.ts
    ├── cookie-helpers.ts
    └── errors.ts
```

This shape is a starting point. Implementation may choose a smaller split if it preserves clarity with less churn.

### `src/packages/users`

Recommended target shape:

```text
src/packages/users/src/
├── index.ts                   # browser-safe schemas, inferred types, public pure contracts
├── domain-errors.ts           # user domain error schemas/types/constructors if browser-safe
├── plans.ts                   # public pure planning helpers if intended for root export
├── service.ts                 # createUserManagementService facade
├── service-types.ts           # service options/interface types
├── operations/
│   ├── list-users.ts
│   ├── create-user.ts
│   ├── get-user.ts
│   ├── update-user.ts
│   └── remove-user-access.ts
└── service-*.ts               # existing query/audit/mapper/error helpers retained or adjusted
```

This package already has several helper files, so the goal is to finish the separation rather than rewrite the service.

### Other `src/packages/*` Candidates

Candidate package files should be handled with the same rule: split by responsibility, not by line count.

Recommended candidates:

* `src/packages/db/src/seed-dev-auth.ts`
  * Keep seed orchestration in one file.
  * Move repository interface/default seed data to focused declaration/config files if useful.
  * Move Postgres repository implementation into a repository adapter file.
  * Move environment/bootstrap helper into an environment/runtime file if it reduces mixing.
* `src/packages/queue/src/index.ts`
  * Keep public queue payload schemas/types in a browser-safe/public contract file.
  * Move URL host normalization and private-IP checks into a focused helper file.
  * Keep job-id construction as a small pure helper or colocate with payload schema.
* `src/packages/auth/src/server.ts`
  * Keep server-only Better Auth runtime creation separate from pure auth contracts in `index.ts`.
  * Move cookie/header extraction helpers into focused server-only helper files if they are not already isolated.
* `src/packages/db/src/schema/*.ts`
  * Treat schema files as declarations by default.
  * Only split schema files when a domain file contains unrelated domain groups or non-schema logic; preserve all exported table/enum names.

## Acceptance Criteria

* [ ] User confirms the exact MVP scope before implementation starts.
* [ ] `prd.md` documents selected backend/package targets and no-logic-change safety rules.
* [ ] Selected files are split into modules with clear responsibilities.
* [ ] Public imports remain compatible unless explicitly approved otherwise.
* [ ] API routes, HTTP methods, status codes, response envelopes, error codes, and user-facing error messages remain unchanged.
* [ ] Auth/session, admin authorization, rate limiting, audit, user-management, and service error semantics remain unchanged.
* [ ] No new feature, route, package, dependency, schema behavior, or database migration is introduced.
* [ ] Relevant tests are preserved or adjusted only for import/module boundary changes.
* [ ] `pnpm typecheck` passes.
* [ ] `pnpm lint` passes.
* [ ] Relevant backend tests pass; if the touched scope is broad, `pnpm test` should run.

## Definition of Done

* Refactor matches `.trellis/spec/backend/*`, `.trellis/spec/shared/*`, and `.trellis/spec/testing/*` guidance.
* Implementation is limited to structural code movement and import/export updates.
* Verification output shows typecheck, lint, and relevant tests are green.
* Any reusable backend module layout convention learned from the refactor is captured in Trellis spec if needed.

## Out of Scope

* Any new product feature.
* Any API contract change.
* Any database schema or migration change.
* Any frontend UI behavior or copy change.
* Any auth, authorization, rate-limit, audit, or session behavior change.
* Replacing Hono, Better Auth, Drizzle, pnpm, Vitest, or project tooling.
* Broad formatting-only churn unrelated to selected backend files.

## Technical Notes

* Current task directory: `.trellis/tasks/05-20-backend-code-refactor`.
* Initial file scan:

```bash
rg --files src/apps/api src/apps/worker src/packages | rg '\.(ts|tsx)$' | xargs wc -l | sort -nr | head -80
```

* Specs relevant for implementation:
  * `.trellis/spec/backend/index.md`
  * `.trellis/spec/backend/api-module.md`
  * `.trellis/spec/backend/api-contract.md`
  * `.trellis/spec/backend/package-boundaries.md`
  * `.trellis/spec/shared/index.md`
  * `.trellis/spec/shared/typescript.md`
  * `.trellis/spec/shared/code-quality.md`
  * `.trellis/spec/testing/index.md`
  * `.trellis/spec/testing/strategy.md`
