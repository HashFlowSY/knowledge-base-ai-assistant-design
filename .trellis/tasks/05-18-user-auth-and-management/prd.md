# 接入真实用户认证、权限和用户管理 API

## Goal

把当前前端 mock 用户体系迁移到真实后端/auth/API：登录使用真实认证会话，页面权限来自服务端 session/tenant membership，admin 用户通过后端 API 管理用户。

## Review Premise

- 审核和澄清 PRD 时必须保持当前需求，不通过“消除歧义”扩大产品范围或新增功能需求。

## What I Already Know

- 当前项目前端仍大量使用 `src/apps/web/src/features/mock/*`，用户已明确本任务目标是接入真实后端/auth/API，不是继续完善 mock。
- 用户要求主要完成：登录；登录后按照当前用户权限展示不同前端页面；admin 用户可以查看、编辑、删除、新增用户；已确认去除 `disabled`/启停用户功能。
- 当前 mock 用户类型位于 `src/apps/web/src/features/mock/types.ts`，角色只有 `admin | member`，状态有 `active | disabled | pending`。
- 当前种子用户在 `src/apps/web/src/features/mock/seed.ts`：`admin@example.com`、`member@example.com`、`pending@example.com`，前两个默认密码为 `password123`；这些只能作为迁移前的行为参考。
- 当前登录页 `src/apps/web/src/features/auth/login-page.tsx` 已按 email/password 和 mock active 状态校验，并支持 `redirectTo`、session expired 提示、invalid credential 提示；接入真实 API 后不再保留 mock active/disabled 状态模型。
- 当前 mock store `src/apps/web/src/features/mock/store.tsx` 已包含 login/logout/session expire/switch role、route access、user CRUD、set user status、audit append 等 reducer 行为；本任务覆盖范围内的这些 mock authority 必须清理。
- 当前导航 `src/apps/web/src/features/shell/navigation.ts` 通过 `adminOnly` 和 `visibleNavigationItems(role)` 隐藏 admin-only 页面。
- 当前路由访问控制中 `/workspace`、`/documents`、`/chat`、`/tasks` 为登录用户可访问；`/logs`、`/providers`、`/users`、`/audit` 为 admin-only；member 直达 admin-only route 会进 `/unauthorized`。
- 当前用户管理页面在 `src/apps/web/src/features/admin/admin-list-page.tsx` 与 `src/apps/web/src/features/admin/user-dialog.tsx`，已经有新增、查看详情、编辑、启停、删除等交互；接入真实 API 时需要移除启停入口，只保留新增、查看、编辑、删除访问权。
- 近期归档任务 `05-18-add-user-password-field` 已规定用户新增/编辑支持密码字段，新增用户可用管理员设置的密码登录。
- 前端规范要求列表状态进入 URL，前端 mock store 仅作为 frontend MVP 例外；后续接真实 API/auth 后，session/actor identity 应来自 auth layer 或 authenticated API。
- `src/apps/api/src/app.ts` 目前只有 `/health`，没有真实 auth middleware、session route、user route 或 Hono RPC route group。
- `src/packages/auth/src/index.ts` 目前只有 `Role`、`AuthActor`、`isAdmin` 等类型/辅助函数，没有 Better Auth runtime。
- `src/packages/users/src/index.ts` 目前只有 `userSummarySchema`，没有用户管理业务逻辑。
- 数据库已存在 Better Auth 兼容的 `auth_users`、`auth_sessions`、`auth_accounts`、`auth_verifications` 表，以及 `tenants`、`tenant_memberships` 表；`tenant_memberships.role` 已是 `admin/member`，`tenant_memberships.is_active` 只承载 default tenant 访问权，`false` 表示访问权已移除，不作为产品层 `disabled` 状态暴露。
- 官方研究记录在 `research/auth-api-integration.md`。最终方案是 Better Auth runtime 负责核心 email/password/session，项目自有 Hono API 包装用户和权限语义。

## Decisions

- 权限模型继续使用固定两级角色 `admin/member`，本任务不引入更细粒度权限矩阵。
- 删除侧边栏 mock 角色切换器。项目已经过 MVP 阶段，登录后的权限必须只来自当前登录用户自身角色。
- 当前登录 admin 不能删除自己或把自己降为 `member`，但可以编辑自己的姓名、邮箱和密码。当前 admin 修改自己的密码时仍按“密码重置”处理：服务端必须撤销该用户全部现有 session，包括当前请求使用的 session；API 成功响应后前端必须清空 TanStack Query cache 并跳转 `/login`，不保留 `redirectTo`。
- 删除 `pending` 和 `disabled` 用户状态；本任务不提供停用/启用用户能力，产品层用户只有“拥有 default tenant 访问权”和“访问权已移除”两种后端语义。
- 本任务接入真实后端/auth/API。已迁移的登录、session、用户管理和权限展示路径不得继续依赖 `MockStoreProvider`、`useMockStore` 或 `localStorage` mock session。
- 必须采用 Better Auth core + 项目自有 Hono RPC auth/session/user API 的方案；前端调用项目包装的 Hono RPC，不直接调用 Better Auth route/client，不采用 Better Auth Admin plugin 直连前端，也不自研 auth/session。
- 本文中“项目包装的 Hono RPC”指：`src/apps/api` 以 Hono 定义固定 HTTP 路径并导出 route type，`src/apps/web` 通过 Hono RPC typed client 调用这些路径。对外 HTTP 路径以本文档列出的 `/api/...` 为准，不另建平行的 `/rpc` 或 Better Auth product contract。
- Better Auth 在本任务中只作为后端 auth runtime 使用。项目 API 的登录、登出和 session/current-user 路径必须通过 Better Auth 服务端 `auth.api` 或受支持的服务端能力完成 credential 校验、session 创建/撤销、session cookie 读写和 session 校验，并由项目 API 自己映射 cookie、错误和响应。用户管理中的新增用户、恢复访问权、admin 重置密码和 dev seed 密码写入不得直接调用无法加入业务事务且会立即提交的 opaque Better Auth mutation helper；这些路径必须通过 `@kb/auth` 暴露的 Better Auth 兼容 password/session helper 完成 password account/hash 写入和 session revocation。该 helper 必须可接收调用方 transaction 或在同一事务边界内执行，且写入的 password account/hash 必须可被 Better Auth 登录运行时校验。登录必须使用 Better Auth server API 的 header/response 返回能力取得 `Set-Cookie`，再由项目包装 API 转发到最终响应；如果无法可靠转发 session cookie，登录必须返回 `INTERNAL_ERROR`，不得报告登录成功。若 Better Auth 的 Hono handler 仍需挂载用于内部兼容或将来调试，只能挂在 `/api/_better-auth/*`，产品前端、产品页面测试和验收标准不得调用该前缀，产品登录不得通过浏览器跳转或直接请求 Better Auth route 完成。
- 项目包装的浏览器认证 API 路径固定为同源 `/api` 下的 Hono RPC/HTTP 契约：
  - `POST /api/auth/login`：body 为 `{ email, password }`，成功后服务端设置 Better Auth session cookie，并通过统一成功 envelope 返回当前用户摘要。
  - `POST /api/auth/logout`：request body 固定为无 body；前端不得发送 `{}`、其他 JSON body 或 `Content-Type: application/json`。服务端撤销当前 session 并清除 session cookie；缺失或已过期 session 也按幂等成功处理。
  - `GET /api/auth/session`：返回当前 session/current-user 摘要；未登录、session 失效或无 default tenant 访问权时按统一错误 envelope 返回。
  - `GET /api/users`：admin-only，返回 default tenant active 用户分页。
  - `POST /api/users`：admin-only，创建或恢复 default tenant 访问权。
  - `GET /api/users/:userId`：admin-only，返回单个 active default tenant 用户。
  - `PATCH /api/users/:userId`：admin-only，更新单个 active default tenant 用户。
  - `DELETE /api/users/:userId/access`：admin-only，request body 固定为无 body；前端不得发送 `{}`、其他 JSON body 或 `Content-Type: application/json`。移除 default tenant 访问权。
- 前后端 JSON 契约固定为统一 response envelope；所有 `/api/auth/*` 与 `/api/users*` 成功响应都必须返回 `ApiSuccessResponse<T>`，所有错误响应都必须返回 `ApiErrorResponse`，不得按接口返回裸 `SessionPayload`、裸 `UserSummary`、裸 `PageResult` 或裸 `{ success: true }`。成功和错误响应都必须包含 `success`、`httpStatus`、`requestId`；成功响应不返回业务 `code`，用 `httpStatus` 表达成功状态；错误响应保留业务 `code`。未列字段不得由前端发送，服务端收到未列字段、空 JSON object 或与路由 body 契约不匹配的 body 时按 `VALIDATION_ERROR` 处理：
  - `Role = "admin" | "member"`。
  - `ApiSuccessResponse<T> = { success: true, httpStatus: number, data: T, requestId: string }`。
  - `ApiErrorResponse = { success: false, httpStatus: number, code: string, message: string, requestId: string, validationErrors?: Array<{ path: Array<string | number>, message: string }> }`。
  - Response body 中的 `httpStatus` 必须与实际 HTTP status code 一致；例如登录成功为 `200`，新增用户成功为 `201`，validation error 为 `400`，unauthorized 为 `401`，forbidden 为 `403`。
  - `SessionPayload = { user: { id: string, name: string, email: string }, tenant: { id: string }, role: Role }`。
  - `UserSummary = { id: string, name: string, email: string, role: Role, createdAt: string, updatedAt: string }`，时间字段为 ISO datetime string。
  - `PageResult<T> = { items: T[], page: number, pageSize: number, total: number }`。
  - `EmptyPayload = null`，用于没有业务返回数据的成功响应；不得使用 `{}` 或 `{ success: true }` 作为 `data`。
  - `POST /api/auth/login` request JSON 固定为 `{ email: string, password: string }`；成功 response JSON 为 `ApiSuccessResponse<SessionPayload>`。
  - `POST /api/auth/logout` request 固定为无 body；成功 response JSON 为 `ApiSuccessResponse<EmptyPayload>`。
  - `GET /api/auth/session` request 固定为无 body；成功 response JSON 为 `ApiSuccessResponse<SessionPayload>`。
  - `GET /api/users` request 固定为 query string，不使用 JSON body；query 为 `{ page?: number, pageSize?: number, search?: string, filter?: "all" | Role, sort?: "updated" | "name" }`；未列 query 参数忽略，已列 query 参数非法时按列表查询规则回退默认值，不作为 `VALIDATION_ERROR`；成功 response JSON 为 `ApiSuccessResponse<PageResult<UserSummary>>`。
  - `POST /api/users` request JSON 固定为 `{ name: string, email: string, role: Role, password: string }`；成功 response JSON 为 `ApiSuccessResponse<UserSummary>`。
  - `GET /api/users/:userId` request 固定为 path param，不使用 JSON body；成功 response JSON 为 `ApiSuccessResponse<UserSummary>`。
  - `PATCH /api/users/:userId` request JSON 固定为 `{ name?: string, email?: string, role?: Role, password?: string | null }`，且至少包含一个已列字段；只包含未列字段或空 JSON object 时返回 `VALIDATION_ERROR`；成功 response JSON 为 `ApiSuccessResponse<UserSummary>`。
  - `DELETE /api/users/:userId/access` request 固定为 path param，不使用 JSON body；成功 HTTP status 固定为 `200`，response JSON 为 `ApiSuccessResponse<EmptyPayload>`。
- 本文档中的 `UserSummary` 固定为 `{ id, name, email, role, createdAt, updatedAt }`。`id` 是 `auth_users.id`，同时也是 `/api/users/:userId` 的 path id；用户管理响应不返回 `tenantId`，因为 default tenant scope 已由 API auth context 固定。
- 现有 `@kb/users` 的旧 `userSummarySchema` 若仍使用 `userId`/`tenantId` 字段，必须在本任务中迁移到本文档的 `UserSummary` 契约；前端不得继续依赖旧 `userId` 或响应内 `tenantId`。
- `@kb/auth` 负责 auth runtime、actor contract、password/session 能力封装和 Better Auth 适配，并暴露 Better Auth 兼容、可进入业务事务的 password account/hash 写入与 session revocation helper；`@kb/users` 负责用户管理 domain logic、default tenant membership 读写、self-protection、列表/详情/恢复访问权语义；`src/apps/api` 只负责 HTTP、middleware、validation、调用编排、CSRF/rate-limit、audit 编排和 error mapping。`@kb/users` 可以依赖 `@kb/auth` 的公开类型和能力接口，但不得直接依赖 Better Auth handler/client 或 Hono context。`@kb/db` seed 可调用 `@kb/auth` 暴露的 dev seed password helper 来生成/更新可登录密码，不复制密码哈希算法。
- 提供可重复执行的 local/dev seed 命令 `pnpm --filter @kb/db seed:dev-auth`，创建默认租户、`admin@example.com` 和 `member@example.com`，默认密码沿用 `password123`。生产环境不自动创建默认账号。seed 命令属于本地开发入口，但密码生成必须复用 `@kb/auth` 的 Better Auth 兼容 helper，避免 seed 与登录运行时使用不同哈希格式。
- 删除用户不硬删除 `auth_users`，也不删除 `tenant_memberships` 行。删除语义是软删除 default tenant 访问权：设置 `tenant_memberships.is_active=false` 并从默认用户列表隐藏；历史审计、文档创建者、任务 requester 等引用保留。
- 本任务的“重置密码”仅指 admin 在用户管理中设置或重置用户密码。新增用户时密码必填；编辑用户时密码字段可选，留空不修改，填写则更新该用户密码哈希。
- 前端路由保护固定采用一个共享客户端 session gate。该 gate 在 app shell/page 边界调用真实 session/current-user API，并统一决定 loading、redirect 和 children 渲染。本任务不实现 Next middleware，也不实现 SSR route guard；API 服务端鉴权才是安全边界。
- `default/current tenant` 固定为 default tenant；登录、session normalization、用户管理和 audit 写入都只解析 default tenant membership，不从请求参数、URL 或客户端状态选择租户。本任务不考虑多租户运行场景，只保留 tenant scope 作为后续设计边界。
- default tenant 的选择规则固定为读取 `tenants.is_default=true` 的唯一租户。缺失 default tenant 是部署/seed 配置错误，不由前端兜底选择租户；API 对该情况返回 `INTERNAL_ERROR`，不是用户访问权 `FORBIDDEN`。
- `auth_users.email` 是全局唯一；新增或编辑邮箱时必须先 `trim` 并 lower-case 归一化，再按全局 lower-case email 唯一约束处理冲突；API 响应中的 email 使用归一化后的值。
- 凭据正确但没有 default tenant 访问权时，登录接口必须返回明确的 `FORBIDDEN` 访问权错误；这里的“没有访问权”只指 default tenant 存在但 membership 缺失或 `is_active=false`。普通邮箱或密码错误仍返回泛化 `UNAUTHORIZED`。如果 Better Auth 已经创建了 session/cookie 后才发现 default tenant 无访问权，项目 API 必须在返回 `FORBIDDEN` 前撤销该 session 并清除 cookie；不得让无访问权用户留下可用 session。任何因退出、无访问权清理或强制登出进入登录页的路径，都必须清理浏览器侧当前 session cookie。
- 登出撤销当前 session，服务端清除 session cookie；前端清空 TanStack Query cache 并跳转 `/login`，不携带也不保留 `redirectTo`。缺失或已过期 session 的登出请求按幂等成功处理，前端仍清缓存并跳转登录页。已登录用户访问 `/login` 时，客户端必须立即 `replace` 到有效内部 `redirectTo`，若缺失或无效则到 `/workspace`；不得继续展示登录表单。
- 密码重置成功必须让目标用户旧密码失败，并让目标用户已有 session 不再可用。因为密码重置不改变 membership，API 必须在成功返回前撤销目标用户现有 `auth_sessions`；用户管理密码重置路径必须通过 `@kb/auth` 暴露的可入事务 session revocation helper 删除/失效该用户的 session 行，验收标准是旧 session token 后续不能解析为有效 actor。如果无法保证旧 session 不可用，则返回 `INTERNAL_ERROR`，不得报告重置成功。若目标用户就是当前 admin，自身当前 session 也必须撤销，前端按登出后状态处理。
- 删除 default tenant 访问权必须作为一个事务成功单元处理：在同一个 DB transaction 内设置目标 membership `is_active=false`、删除或失效目标用户现有 `auth_sessions`、写入 `user.access_removed` audit。任一必需步骤失败则事务回滚并返回 `INTERNAL_ERROR`，不得报告访问权移除成功。删除当前 admin 自己仍必须被拒绝，因此不存在自删后的当前 session 行为。
- 用户姓名、邮箱或角色变更本身不要求撤销 session。现有 session 在下一次 `session/current-user` 或受保护 API 解析 actor 时必须读取最新 default tenant membership 和用户资料；角色变更后权限以最新 membership 为准。
- 限流存储和计数只属于 API 服务端基础设施。浏览器和 `src/apps/web` 不得直接连接 Redis；前端只处理 API 返回的 `429 RATE_LIMITED`、安全 message 和 `Retry-After`。
- 限流采用服务端粗粒度双 scope 方案：`auth` 覆盖登录、session 查询和登出；`user-management` 覆盖 `/api/users*` 的读、写和越权访问。只分两个 scope 是本任务的明确取舍：当前认证面只有同源 `/api` 的登录/session/logout 与 admin 用户管理两类高风险入口；细分登录失败、session polling、普通用户变更、密码重置、删除访问权、admin forbidden 等子 scope 会显著增加实现和测试成本，但不会改变本任务的产品安全边界。后续只有在出现独立暴露面、独立滥用模式或合规要求时才扩展 scope。
- 当前项目按单体架构处理浏览器访问面：前端通过同源 `/api` 调用项目 Hono RPC。生产可由反向代理把 `/api/*` 转发到 Hono API；本地开发可由 Next rewrite/proxy 把 `/api/*` 转发到 `localhost:4000`。前端不直接使用跨源 API base URL 作为认证主链路。
- Cookie/session 策略采用同源 session cookie：生产 cookie 必须 `HttpOnly`、`Secure`、`SameSite=Lax`，优先 host-only cookie；本地 localhost 可允许非 `Secure`。前端不读取 session cookie，只通过 session/current-user Hono RPC 获取当前用户。
- Cookie 名称、path、过期时间和续期策略沿用 Better Auth runtime 配置或默认值；本任务不要求自定义 cookie 名称或自定义 session TTL。前端代码和测试不得依赖具体 cookie 名称，只验证安全属性和 session 行为。
- CORS 不是认证主链路。API CORS 只能 allow 配置的 `APP_BASE_URL`/部署 web origin，不能使用 `*`；同源 `/api` 请求应不依赖 CORS 成功。
- CSRF 防护必须覆盖项目包装的 Hono RPC mutation：保留 Better Auth 自身 auth/session 防护；项目 Hono API 的 `POST`/`PATCH`/`PUT`/`DELETE` 必须执行项目 CSRF guard。有 JSON request body 的浏览器 mutation 必须使用 `Content-Type: application/json` 并按本文档固定 body shape 发送；固定为无 body 的 mutation 必须省略 request body，不得发送 `{}`、其他 JSON body 或 `Content-Type: application/json`。所有浏览器 mutation 都必须满足：`Origin` 存在且等于同源 origin 或配置的 `APP_BASE_URL`；若存在 `Sec-Fetch-Site`，只接受 `same-origin` 或 `same-site`。缺失 `Origin` 的浏览器 mutation 一律拒绝；非浏览器测试/服务端调用只能在测试环境通过显式 helper/header 绕过，并且该绕过不得在生产启用。`GET` 必须只读。

## Scope Clarifications

- 只有 default tenant membership `is_active=true` 的用户可登录并进入 app shell；`is_active=false` 表示访问权已移除，不作为 `disabled` 状态暴露。
- admin-only 页面包括 `/logs`、`/providers`、`/users`、`/audit` 及其子路径；member 只能访问 `/workspace`、`/documents`、`/chat`、`/tasks` 及其子路径。路由匹配规则固定为 exact path 或以该 path 加 `/` 为前缀。
- `/logs`、`/providers`、`/audit` 的业务数据迁移不属于本任务，但这些页面的导航可见性、直接 URL 访问和 shell 渲染必须接入真实 session/role gate；也就是说数据可暂时保留 mock，页面访问权限不能继续由 mock session/role 决定。
- 首版固定 default tenant，但 API 和数据库读写仍必须显式携带 tenant scope；多租户运行、租户切换和跨租户用户资料影响不作为本任务实现、测试或验收场景。
- 用户列表和用户详情只展示 default tenant 中 `is_active=true` 的用户。inactive membership 或缺失 membership 的目标用户，对详情/编辑/删除接口表现为 `NOT_FOUND`；恢复访问权只通过 `POST /api/users` 的新增同邮箱路径完成，具体分支以 Requirements 中的“新增用户按全局 lower-case email 分支处理”为准。
- 当前任务不新增注册、邀请、邮箱验证、找回密码、自助改密、强制改密、多租户切换或用户启用/停用功能。

## Open Questions

- 无功能性开放问题；本文档已把实现分支、响应 shape、安全边界和验收口径固定到可执行粒度。

## Requirements (evolving)

- 后端必须配置真实 email/password auth runtime、session cookie，并通过项目包装的 Hono RPC 暴露登录、登出和 session/current-user 查询能力。`GET /api/auth/session` 成功返回 `ApiSuccessResponse<SessionPayload>`；缺失 session 返回 HTTP `401` + `ApiErrorResponse`，其中 `code=UNAUTHORIZED`、`message=请先登录。`；过期或已撤销 session 返回 HTTP `401` + `ApiErrorResponse`，其中 `code=UNAUTHORIZED`、`message=登录已过期，请重新登录。`；session 有效但 default tenant membership 缺失或 inactive 返回 HTTP `403` + `ApiErrorResponse`，其中 `code=FORBIDDEN`、`message=当前账号无权访问默认租户，请联系管理员。`；default tenant 缺失或不唯一返回 HTTP `500` + `ApiErrorResponse`，其中 `code=INTERNAL_ERROR`、`message=操作失败，请稍后重试。`。前端 session query 需把这些错误映射为 auth state，不把原始异常展示给用户：`UNAUTHORIZED` 进入 unauthenticated 状态并按 route gate 规则跳 `/login?redirectTo=<internal-path>`；session `FORBIDDEN` 进入 no-default-tenant-access 状态，清空 auth/session query cache，跳 `/login` 且不保留 `redirectTo`；`INTERNAL_ERROR` 或 `RATE_LIMITED` 渲染安全错误状态，不渲染受保护 children。
- Auth/session/user-management Hono RPC 必须暴露在同源 `/api` 路径下；前端 Hono RPC client 默认使用相对 `/api` base path。
- 本地开发和生产都应让浏览器以同源方式访问认证 API。生产通过反向代理/TLS 终止器路由 `/api/*` 到 Hono；本地开发通过 Next rewrite/proxy 路由 `/api/*` 到本地 Hono API。
- API middleware 必须解析 session，归一化 `actor` 和 `tenantId`，并对 protected/admin route fail closed。每次 session/current-user 和受保护 API actor 解析都必须重新读取当前 `auth_users` 与 default tenant membership，不依赖 session 中缓存的 role/name/email 作为授权来源。
- 登录必须通过项目包装的 Hono RPC 调用真实 auth runtime 校验 email/password，并拒绝没有 default tenant `is_active=true` membership 的用户。登录失败优先级固定为：
  - 请求体不合法 -> `VALIDATION_ERROR`。
  - email/password 无法通过 auth runtime 校验，或账号不存在/无 password account -> `UNAUTHORIZED`。
  - default tenant 缺失或不唯一 -> `INTERNAL_ERROR`。
  - 凭据已通过但 default tenant membership 缺失或 `is_active=false` -> `FORBIDDEN`。
  - session cookie 写入或 auth runtime 异常 -> `INTERNAL_ERROR`。
- 登录成功后前端 session/current-user 数据来自项目 Hono RPC，包含当前用户 id、default tenant id、role、name、email。
- 页面导航和直接 URL 访问都必须按服务端 session/role 决定可见/可访问页面。
- 前端 protected 页面在 session/current-user 判定完成前只能渲染 skeleton/loading，不能渲染受保护 children，避免短暂展示无权内容。
- 前端 route gate 只负责用户体验：未登录时客户端跳转 `/login?redirectTo=<internal-path>`，member 访问 admin-only 页面时客户端跳转 `/unauthorized`。真正安全依赖 API admin guard，member 直接请求 admin API 必须返回 `FORBIDDEN`。
- `redirectTo` 只能接受内部绝对路径：必须以单个 `/` 开头，不能以 `//` 开头，不能包含 URL scheme，允许 query/hash。空值、外部 URL、协议相对 URL、`/login`、`/login/*` 或解析失败值必须回退到 `/workspace`。登录成功后如果目标路径对当前角色不可访问，客户端 route gate 按正常权限规则跳转 `/unauthorized`。
- 侧边栏不再提供 role switcher；测试不再依赖登录后手动切换角色来验证权限。
- 登录、session、权限展示和 `/users` 已迁移路径中的用户状态类型、API response、表单选项和状态文案必须移除 `pending` 和 `disabled`；本任务不实现前端启用/停用入口。
- 前端已迁移路径不得使用旧 localStorage mock session；登录、session、权限和 `/users` 数据必须来自 Hono RPC + TanStack Query。
- 未登录访问受保护页面必须跳转登录页，并保留内部 `redirectTo`。
- admin 用户必须可以在 `/users` 查看用户列表和用户详情。
- admin 用户必须可以通过 API 新增用户，新增用户要写入真实 auth/user/membership 数据并能按设置的密码登录。
- admin 用户必须可以通过 API 编辑用户基本信息、角色，以及可选重置密码；本任务不提供状态编辑。编辑当前 admin 自己时允许修改姓名、邮箱和密码，禁止把自己的角色改成 `member`。如果当前 admin 修改自己的密码，PATCH 成功后前端按强制登出处理。
- `POST /api/users` request body 固定为 `{ name, email, role, password }`。`role` 只能是 `admin` 或 `member`；`name`、`email`、`password` 都是必填字符串；`name` trim 后不能为空；`email` trim/lower-case 后必须是合法 email；`password` trim 只用于判空，实际交给 Better Auth runtime 校验和写入的密码值保持用户提交的原始字符串。
- `PATCH /api/users/:userId` request body 固定为 `{ name?: string, email?: string, role?: "admin" | "member", password?: string | null }`。省略字段表示不修改；提供 `name` 时 trim 后不能为空；提供 `email` 时按 trim/lower-case 归一化并校验；提供 `role` 时只能是 `admin` 或 `member`；`password` 省略、`null` 或 trim 后为空字符串都表示不修改密码，非空字符串表示重置密码并触发 session revocation，实际交给 Better Auth runtime 校验和写入的密码值保持用户提交的原始字符串。request body 必须至少包含一个已列字段；如果提供的已列字段归一化后没有任何有效变化，返回 HTTP `200` + 当前 `UserSummary`，不写 audit。
- 编辑邮箱时，目标邮箱与另一个 `auth_users` 的 lower-case email 冲突必须返回 `CONFLICT`；目标邮箱只与当前用户自身匹配时允许保存归一化值。
- admin 在编辑用户时填写新密码必须更新该用户的密码哈希，不得存储明文密码；留空必须保持原密码不变。
- admin 重置某个用户密码后，API 必须撤销该用户现有 session，并写入审计日志；审计 metadata 不得包含明文密码、密码哈希或可恢复的秘密。若一次编辑同时包含基本信息/角色变更和密码重置，业务变更、session 撤销和对应 audit 写入必须作为一个成功单元处理：任一必需步骤失败则整体返回错误，不报告部分成功。实现必须在 transaction 内通过 `@kb/auth` 的 Better Auth 兼容 helper 更新 password account/hash，并在传入的同一个 transaction 内删除或失效目标用户 session；用户资料、membership、password hash、session revocation、audit 写入应尽量在同一个 DB transaction 内完成。核心用户管理事务不得调用无法加入事务且会立即提交的 opaque Better Auth mutation helper。若 session 撤销或 audit 写入失败，必须回滚可回滚写入或返回 `INTERNAL_ERROR`，确保客户端不会看到部分成功。
- admin 用户必须可以通过 API 删除用户访问权；真实语义是软删除 default tenant 访问权，即设置 `tenant_memberships.is_active=false` 并从默认用户列表隐藏，不硬删除 `auth_users` 或删除 membership 行。
- 当前 admin 用户行必须对删除、降权操作给出不可用状态，并且 API 也必须拒绝这些操作。
- 删除 default tenant 访问权时，API 必须在同一个 DB transaction 内设置 `tenant_memberships.is_active=false`、删除或失效该用户现有 `auth_sessions`、写入 `user.access_removed` audit。三者都是删除访问权成功响应的必需条件；任一必需步骤失败必须回滚事务并返回 `INTERNAL_ERROR`，不得报告访问权移除成功。即使正常删除访问权路径会事务化撤销 session，`session/current-user` 和受保护 API 仍必须每次重新读取 default tenant membership；如果发现 membership inactive 或 missing，必须 fail closed。重置密码后，API 必须删除或失效该用户现有 `auth_sessions` 后才返回成功；若无法确认 session 已失效，返回 `INTERNAL_ERROR`。
- 用户管理变更需要写入真实 audit logs。事件名固定为：`user.created`、`user.updated`、`user.access_removed`、`user.password_reset`；越权访问使用 `auth.forbidden`。如果一次编辑同时修改基本信息/角色和密码，必须分别写入 `user.updated` 与 `user.password_reset`，且两个事件的 metadata 都不得包含明文密码、密码哈希或可恢复秘密。`user.updated` metadata 只记录安全字段名和角色/email 这类非秘密变更摘要；密码相关 metadata 只能记录是否发生重置和 session 撤销结果。恢复 default tenant 访问权不新增 `user.access_restored` 事件：恢复路径必须写 `user.created`，metadata 用安全字段标记 `restoredAccess: true`。本任务会同步更新 `.trellis/spec/backend/audit.md`，把这些 action name 纳入项目审计契约；这不是新增产品需求，只是消除 PRD 与现有 spec 的命名冲突。
- 非 admin 用户不能看到 `/users` 导航，也不能通过直接 URL 或 API 调用访问用户管理能力。
- API error response 必须遵循本文档统一 envelope 下的 `ApiErrorResponse` 形状和项目标准 code，不新增全局 spec code；本任务通过标准 `code` + 安全中文 `message` 表达 auth/user 业务错误。
- Auth/session/user-management API 必须实现本任务定义的双 scope 限流策略。限流在 API 服务端执行，前端只展示 `RATE_LIMITED` 错误提示。同一请求只计入一个 scope：认证相关 route 计入 `auth`，`/api/users*` route 计入 `user-management`，不再为登录失败、session 查询、普通用户变更、密码重置、访问权移除或越权访问拆分额外 scope。
- 前端不得读取、写入或配置 Redis rate-limit key；所有 Redis/in-process limiter 访问都封装在 `src/apps/api` 或后端共享基础设施内。
- 认证 API cookie/CORS/CSRF 必须按本任务的同源 `/api` 策略实现：cookie 使用 Better Auth session cookie；CORS allowlist 只接受部署 web origin；state-changing Hono RPC route 必须使用本 PRD 固定的项目 CSRF guard 规则。
- Local/dev seed 命令 `pnpm --filter @kb/db seed:dev-auth` 必须幂等：重复执行不会创建重复租户或重复用户，会确保两个默认账号存在、密码可用、租户 membership 状态和角色正确。
- Local/dev seed 命令必须拒绝在 production 环境自动创建默认账号。production 判定以统一配置 loader 解析后的 `NODE_ENV === "production"` 为准，不在 seed 脚本中绕过配置系统直接读取散落环境变量。
- 新增用户按全局 lower-case email 分支处理，避免“恢复访问权”和“邮箱冲突”歧义：
  - 不存在 `auth_users`：创建 `auth_users`、password account、default tenant membership，返回 `201`，audit `user.created`。
  - 存在 `auth_users` 且 default tenant membership `is_active=true`：返回 `CONFLICT`，不修改用户或密码。
  - 存在 `auth_users` 且 default tenant membership `is_active=false`：复用该 `auth_users`，更新 name/email/password，设置 membership `is_active=true` 且 role 按本次输入覆盖，返回 `201`，audit `user.created` 且 metadata 标记 `restoredAccess: true`；成功返回前必须撤销该用户旧 session，避免恢复访问权后旧 session 重新可用。
  - 存在 `auth_users` 但缺失 default tenant membership：复用该 `auth_users`，更新 name/email/password，创建 default tenant membership，role 按本次输入，返回 `201`，audit `user.created` 且 metadata 标记 `restoredAccess: true`；成功返回前必须撤销该用户旧 session，避免创建 default tenant membership 后旧 session 重新可用。
  - 本任务只实现 default tenant 语义；其他 tenant membership 不作为实现、测试或验收场景，也不由本任务修改。
  - 若已存在用户没有 password account，新增/恢复路径必须创建或修复 password account，使其可用本次设置密码登录。

## Design

Adopt Better Auth core + project-owned user/session APIs.

### Backend/auth

- Introduce a real Better Auth runtime configured for email/password and Drizzle/Postgres persistence.
- Implement the runtime and actor/session contract in `@kb/auth`.
- Keep project roles in `tenant_memberships.role`, not in frontend mock state.
- Expose auth/session/user-management to the web app through project-owned Hono RPC endpoints. Better Auth internals stay behind API/package boundaries.
- Product-facing auth/session responses are project-owned and use this exact shape:
  - `user: { id, name, email }`
  - `tenant: { id }`
  - `role: "admin" | "member"`
  - no password/account/session token fields.
  This same payload is the `data` field inside the unified `ApiSuccessResponse<SessionPayload>` returned by successful `POST /api/auth/login` and `GET /api/auth/session`.
- Resolve only the default tenant for this task. `tenant_memberships.is_active` is the source of truth for default tenant access:
  - `true` -> user can access the default tenant.
  - `false` or missing default tenant membership -> cannot access the default tenant and cannot log into the app shell.
- Add auth/session middleware in the Hono API:
  - request context sets `requestId` first.
  - auth middleware resolves Better Auth session.
  - tenant middleware resolves default tenant membership and attaches normalized `actor`.
  - admin guard enforces `actor.role === "admin"` for user-management routes.
  - default tenant lookup failures caused by missing or non-unique `tenants.is_default=true` are treated as server configuration errors and mapped to `INTERNAL_ERROR`.

### Backend/users

- Implement user-management domain logic in `@kb/users` with explicit inputs:
  - list users with pagination/search/sort/role filters.
  - get user detail.
  - create user or restore deleted default tenant access by email.
  - update name/email/role and optional password.
  - soft-delete default tenant access by setting `tenant_memberships.is_active=false` without hard-deleting `auth_users` or deleting the membership row.
- User list query contract uses offset pagination and the existing URL state names: `page`, `pageSize`, `search`, `filter`, and `sort`.
  - `page` defaults to `1`; non-integer, missing, zero, negative, or otherwise invalid values fall back to `1`.
  - `pageSize` defaults to `8`; allowed values follow the existing admin pagination control: `5`, `8`, and `12`; invalid values fall back to `8`.
  - `search` trims input and uses case-insensitive contains matching against name/email only.
  - `filter` accepts `all`, `admin`, or `member`; `all` means no role filter. Invalid values fall back to `all`.
  - `sort` accepts `updated` or `name`; invalid values fall back to `updated`; `updated` sorts by `updatedAt` descending and is the default; `name` sorts by normalized name ascending. Sort ties use `id` ascending as a stable deterministic tie-breaker. The existing UI `status` sort option must be removed for `/users` because product user status is out of scope.
  - If the requested `page` is greater than the available result pages after filtering, the API returns an empty `items` array and preserves the normalized requested `page` in the response instead of clamping to the last page.
  - response `data` shape is the project standard `PageResult<UserSummary>` inside the unified `ApiSuccessResponse<PageResult<UserSummary>>` envelope.
- User-management list/detail responses expose only active default tenant users. `UserSummary` fields固定为 `id`, `name`, `email`, `role`, `createdAt`, and `updatedAt`; they must not include password/account/session internals, `tenantId`, `userId`, or a product `status` field. `createdAt` is `auth_users.createdAt`. `updatedAt` is an effective user-management timestamp computed as the later of `auth_users.updatedAt` and the matching default `tenant_memberships.updatedAt`, so role/access restore/remove changes are reflected in `sort=updated` without exposing membership internals.
- User-management search/sort/filter stays within the current UI needs: search by name/email, filter by role, and sort by existing table columns already represented in the user-management page. No new advanced filtering UI is added in this task.
- Enforce self-protection on the server:
  - current admin cannot delete self.
  - current admin cannot change own role to `member`.
  - current admin may change own password; this revokes all of their sessions including the current one, so frontend must treat successful response as logout.
- Write audit records for create/update/delete/role/password-management events, without storing plaintext password or raw secrets.
- Use fixed audit action names: `user.created`, `user.updated`, `user.access_removed`, `user.password_reset`, and `auth.forbidden`. These names supersede the older `user.disabled` wording for this task and must be reflected in the audit spec before implementation finishes.
- Password-management events in this task mean admin-triggered password set/reset only, not self-service recovery. Resetting a password must update the stored password hash and invalidate/reject existing sessions for that user.

### Frontend

- Replace login form mock dispatch with real auth/API submit.
- Use client-side session/current-user API data to gate app shell, visible navigation, and direct route access.
- Use the project Hono RPC client plus TanStack Query for login/session/logout/user-management calls; the client uses relative `/api` as its base path and does not call Better Auth client APIs directly from product pages.
- Do not add Next middleware or SSR route guards in this task. Keep route protection in the client session gate and keep API authorization as the security boundary.
- Protected client gate behavior is deterministic:
  - pending session query -> render skeleton/loading only.
  - unauthenticated -> `router.replace("/login?redirectTo=<internal-path>")`.
  - authenticated member on admin-only route -> `router.replace("/unauthorized")`.
  - authorized user -> render children.
- The client gate should be a shared app-shell/page boundary reused by migrated protected routes, not one-off permission checks duplicated inside each page. Page-level UI may still hide unavailable actions, but it is not the authority source.
- Remove the sidebar role switcher and related mock role-switch reducer usage from migrated flows.
- Migrate `/users` from mock store to TanStack Query + typed API client.
- Remove or stop rendering user-management status controls for `disabled`/enable/disable in this task. User removal is access removal, not a disabled state workflow.
- Keep unrelated pages that are not part of this task on their existing mock business data only if required for scope control.
- Mock store may temporarily retain unrelated business data, but all mock data and reducers covered by this task must be removed or stopped as authority sources: mock users, mock user passwords/statuses, mock session, mock login/logout, mock role switch, mock route access, and mock `/users` CRUD.

### Error contract

- Do not update `.trellis/spec` for new global error codes in this task.
- Use the unified project error envelope shape: `{ success: false, httpStatus, code, message, requestId, validationErrors? }`.
- Use only existing standard API codes from the backend API contract.
- Frontend copy must map from `code` and safe `message`; it must not display raw Better Auth errors, stack traces, SQL details, password hashes, token values, or secret-bearing payloads.

| Scenario | API code | Safe message |
| --- | --- | --- |
| Email or password is incorrect | `UNAUTHORIZED` | 邮箱或密码不正确。 |
| Session is missing for a protected API | `UNAUTHORIZED` | 请先登录。 |
| Session is expired or revoked | `UNAUTHORIZED` | 登录已过期，请重新登录。 |
| Credentials are correct but default tenant access has been removed | `FORBIDDEN` | 当前账号无权访问默认租户，请联系管理员。 |
| Default tenant is missing or non-unique | `INTERNAL_ERROR` | 操作失败，请稍后重试。 |
| Member calls an admin-only API | `FORBIDDEN` | 你没有权限执行此操作。 |
| Current admin tries to delete or demote self | `FORBIDDEN` | 不能对当前登录管理员执行此操作。 |
| Request body/query/path validation fails | `VALIDATION_ERROR` | 请检查填写内容。 |
| Email conflicts with another global user | `CONFLICT` | 该邮箱已存在。 |
| Target user does not exist or is not visible in default tenant | `NOT_FOUND` | 用户不存在或已被移除。 |
| Password hash/update unexpectedly fails | `INTERNAL_ERROR` | 密码更新失败，请稍后重试。 |
| Unexpected server error | `INTERNAL_ERROR` | 操作失败，请稍后重试。 |

### Rate limiting

- Rate-limit policy for these auth/user-management routes is documented in `.trellis/spec/backend/security.md`; this PRD fixes only the concrete routes, limits, and identities needed by the current task.
- Rate limiting must run only on the API server; the frontend must not access limiter storage directly.
- Use exactly two rate-limit scopes for this task:
  - `auth`: covers `POST /api/auth/login`, `GET /api/auth/session`, and `POST /api/auth/logout`.
  - `user-management`: covers all `/api/users*` routes, including list/detail/create/update/delete-access, member forbidden attempts, unauthenticated admin-route probing, validation failures, and CSRF/content-type failures.
- The two-scope model is intentional, not an incomplete first pass. It matches the two externally reachable risk groups in this PRD: authentication/session traffic and admin user-management traffic. Login failures, session polling, logout, ordinary user updates, password resets, access removal, and forbidden admin attempts are handled by identity selection inside these two scopes instead of by additional scenario scopes. Do not split into finer scopes in this task unless a later PRD adds a separate exposed surface or a concrete abuse case that needs independent quotas.
- Exceeded requests return `429` with API code `RATE_LIMITED`, safe message `请求过于频繁，请稍后重试。`, and a `Retry-After` header.
- Login credential errors must not reveal whether an email exists. When email/password are correct but default tenant access has been removed, the login API may return a specific `FORBIDDEN` access error even though this reveals that the email belongs to an existing account.
- Unauthenticated identities use `ipSummary` derived by the API from the trusted request client IP after proxy normalization. Do not store the full IP in rate-limit keys.
- Authenticated identities use stable internal ids such as `tenantId + actorId`; session identities use a hash of the raw Better Auth session cookie value.
- Scope identity selection is fixed as follows:
  - `auth` login requests use `ipSummaryHash + normalizedEmailHash` when a parseable email is present, otherwise `ipSummaryHash`.
  - `auth` session/logout requests use `sessionCookieHash` when a session cookie is present, otherwise `ipSummaryHash`.
  - `user-management` requests use `tenantId + actorId` after an actor is successfully resolved.
  - `user-management` requests use `ipSummaryHash` when no actor can be resolved, including unauthenticated admin-route probing and CSRF/content-type failures that happen before actor resolution.
  - `user-management` requests from an authenticated non-admin user use that user's `tenantId + actorId`; they also write the required `auth.forbidden` audit event.
- 如果请求在 actor 解析前被 CSRF、content-type 或 body guard 拒绝，该请求只按 `ipSummaryHash` 计入对应 route scope；如果 actor 解析成功，则只按 actor identity 计入。单个请求不得同时递增两个 limiter key。
- Local/dev rate limiting uses Redis from the project Docker/compose stack. Docker Desktop is expected to be running for local development; the implementation must keep Redis access behind API-side limiter infrastructure so auth/user business logic does not depend on Redis details.
- Redis key format, when Redis-backed:

```text
kbai:ratelimit:{scope}:{window}:{identity}
```

- `scope` must be either `auth` or `user-management`.
- `window` is the configured window label such as `15m`, `10m`, or `1m`.
- `identity` must not include raw email, full IP, full user-agent, session token, cookie, password, password hash, or other secret-bearing values.
- `normalizedEmailHash = sha256(lowercase(trim(email)))`.
- `sessionCookieHash = sha256(raw Better Auth session cookie value)` when a session cookie is present; never place the raw session token/cookie directly in Redis keys.
- `ipSummaryHash = sha256(ipSummary)`.
- `tenantId` and `actorId` are internal ids and may be included directly.
- Redis value stores the count. TTL equals the rate-limit window plus a small buffer, defaulting to window + 30 seconds.
- Redis key length must stay under 200 characters.

| Scope | Covered routes/failures | Redis key | Limit | Notes |
| --- | --- | --- | ---: | --- |
| `auth` | Login with parseable email, including validation/credential/tenant/session-cookie failures after email parse | `kbai:ratelimit:auth:15m:ip:{ipSummaryHash}:email:{normalizedEmailHash}` | 30 / 15 min | Counts every login attempt for the same normalized email from the same IP summary. |
| `auth` | Login without parseable email, including malformed body/content-type/CSRF failures | `kbai:ratelimit:auth:15m:ip:{ipSummaryHash}` | 30 / 15 min | Prevents anonymous malformed login bursts without needing raw email. |
| `auth` | Session lookup or logout with session cookie | `kbai:ratelimit:auth:1m:session:{sessionCookieHash}` | 120 / 1 min | Uses hashed session cookie only; never stores the raw token/cookie. |
| `auth` | Session lookup or logout without session cookie | `kbai:ratelimit:auth:1m:ip:{ipSummaryHash}` | 120 / 1 min | Covers unauthenticated polling and logout without a session. |
| `user-management` | `/api/users*` after actor resolution, including admin success, admin validation/business errors, member forbidden attempts, and self-protection failures | `kbai:ratelimit:user-management:1m:tenant:{tenantId}:actor:{actorId}` | 120 / 1 min | Uses one quota for user-management reads, writes, sensitive writes, and forbidden attempts by the same actor. |
| `user-management` | `/api/users*` before actor resolution, including unauthenticated probing and CSRF/content-type failures | `kbai:ratelimit:user-management:1m:ip:{ipSummaryHash}` | 60 / 1 min | Covers admin-route traffic that cannot be attributed to an actor. |

### Deployment/auth transport

- Browser-facing auth/API traffic uses same-origin `/api`.
- Production deployment must route `/api/*` from the web origin to the Hono API through the reverse proxy or TLS terminator.
- Local development should route `/api/*` from Next.js to `localhost:4000` through a Next rewrite/proxy instead of making browser-authenticated calls directly to `http://localhost:4000`.
- 本任务交付本地 Next rewrite/proxy 和应用所需配置；生产反向代理/TLS 终止器只作为部署要求记录，不要求在本代码库提交环境专属代理配置。
- The frontend API client must use relative `/api` by default. `NEXT_PUBLIC_API_BASE_URL` must not be required for browser-authenticated auth/session/user-management calls.
- Better Auth session cookies are not readable by frontend code. Production cookies must be `HttpOnly`, `Secure`, `SameSite=Lax`, and host-only unless a future deployment explicitly requires a shared cookie domain. Localhost development may use non-`Secure` cookies.
- API CORS exists only as a defensive allowlist for configured web origins and must never use `*` on authenticated routes.
- Project-owned Hono RPC mutations must have CSRF protection in addition to Better Auth's own auth/session protections:
  - require `Content-Type: application/json` only for mutation routes with a JSON request body.
  - fixed no-body mutations, currently `POST /api/auth/logout` and `DELETE /api/users/:userId/access`, must send no request body and no JSON `Content-Type`; sending `{}` or any other body is invalid.
  - require browser mutation `Origin` to equal same-origin or configured `APP_BASE_URL`.
  - if `Sec-Fetch-Site` is present, accept only `same-origin` or `same-site`.
  - reject browser mutation requests with missing/invalid `Origin`, form content types, or simple-request content types.
  - allow test/server callers to bypass only through the non-production-only explicit header `X-KB-Test-CSRF-Bypass: 1`; production code must ignore or reject that bypass header.
  - keep `GET` routes read-only.

### Local/dev bootstrap

- Add an idempotent local/dev seed command `pnpm --filter @kb/db seed:dev-auth` that creates:
  - default tenant.
  - `admin@example.com` with role `admin`, default tenant access active, password `password123`.
  - `member@example.com` with role `member`, default tenant access active, password `password123`.
- The command must refuse production auto-seeding.

### Tests

- Backend tests cover login/session actor normalization, admin guard, member forbidden access, removed-access user rejection, user create/update/delete, restore by same email, self-protection, delete-access transaction rollback on required step failure, session response HTTP status/error mapping, CSRF guard, and two-scope limiter identity selection.
- Backend/package tests cover the updated `@kb/users` `UserSummary` contract: response items use `id` and omit `userId`/`tenantId`.
- Backend tests cover admin password reset: blank password preserves the existing password, a new password updates the password hash, old credentials fail, existing sessions are revoked or rejected, and current-admin self password change forces logout behavior.
- Frontend tests cover login submit, already-authenticated `/login` redirect, logout, role-based navigation, no role switcher, no disabled/status workflow, unauthorized member direct route, current-admin self password-change logout handling, and `/users` API-backed CRUD behavior.

## Acceptance Criteria (evolving)

- [ ] 使用 `admin@example.com` / `password123` 登录后能看到 admin 导航，包括用户管理。
- [ ] 使用 `member@example.com` / `password123` 登录后只能看到 member 允许页面，看不到 `/users`、`/logs`、`/providers`、`/audit`。
- [ ] 登录后的侧边栏不再显示角色切换器，当前权限只由登录账号角色决定。
- [ ] 已登录用户访问 `/login` 时不会看到登录表单，会按有效内部 `redirectTo` 或默认 `/workspace` 跳转。
- [ ] member 直接访问 `/users` 会进入 unauthorized 状态。
- [ ] member 直接调用用户管理 API 会得到 `FORBIDDEN`。
- [ ] auth/user API 错误响应使用现有标准 code 和安全中文 message，不新增全局错误码。
- [ ] 前端登录、登出、session/current-user 和用户管理调用项目包装的 Hono RPC，不直接依赖 Better Auth client 或 mock store。
- [ ] 浏览器认证 API 调用使用同源 `/api`，前端 Hono RPC client 默认使用相对路径，不依赖跨源 `NEXT_PUBLIC_API_BASE_URL`。
- [ ] 本地 Next rewrite/proxy 将 `/api/*` 转发到 Hono API；生产反向代理/TLS 终止器路由作为部署要求记录，认证主链路不要求跨源 cookie。
- [ ] 生产 session cookie 为 `HttpOnly`、`Secure`、`SameSite=Lax`、host-only；本地 localhost 可使用非 `Secure` cookie。
- [ ] 本任务不自定义 Better Auth cookie 名称或 session TTL；前端和测试只依赖 session 行为及 cookie 安全属性，不硬编码 cookie 名称。
- [ ] Authenticated API 的 CORS allowlist 只接受配置的 web origin，不允许 `*`。
- [ ] 项目 Hono RPC mutation 具备 PRD 固定 CSRF guard：带 JSON request body 的浏览器 mutation 必须使用 `Content-Type: application/json`；固定无 body mutation 不发送 body、不发送 `{}`、不发送 JSON `Content-Type`；所有浏览器 mutation 必须有合法 `Origin`；`Sec-Fetch-Site` 若存在只能是 `same-origin`/`same-site`；表单类/simple request 被拒绝，`GET` 不做状态变更。
- [ ] auth/session/user-management API 按本任务双 scope 限流表执行：`auth` 覆盖登录、session 查询和登出，`user-management` 覆盖 `/api/users*` 的读取、写入和越权访问；超限返回 `429 RATE_LIMITED`、安全中文提示和 `Retry-After` header。
- [ ] Redis 使用 Docker/compose 提供本地服务；API 限流连接该 Redis 后端，Redis-backed limiter key 命名符合 `kbai:ratelimit:{scope}:{window}:{identity}`，且 key 不包含 raw email、完整 IP、完整 user-agent、session token、cookie、密码或 hash。
- [ ] 未登录访问受保护内部路径会跳转到 `/login?redirectTo=<path>`，登录成功后回到该路径。
- [ ] protected 页面在 session/current-user 加载完成前只显示 loading/skeleton，不渲染受保护内容。
- [ ] 本任务没有新增 Next middleware 或 SSR route guard；前端路由保护由客户端 session gate 完成，API guard 负责真实安全。
- [ ] `redirectTo` 仅接受以单个 `/` 开头、无 URL scheme 的内部绝对路径，可包含 query/hash；外部 URL、协议相对 URL、空值、解析失败值和 `/login`/`/login/*` 会回退 `/workspace`。
- [ ] 登出会撤销当前 session、清除 session cookie、清空 TanStack Query cache，并跳转 `/login`，不保留 `redirectTo`。
- [ ] 没有 default tenant `is_active=true` membership 的用户不能进入 app shell；若 email/password 正确但访问权已移除，登录 API 返回明确的 `FORBIDDEN` 访问权错误，并且不会留下可用 Better Auth session/cookie。
- [ ] default tenant 缺失或不唯一时 API 返回 `INTERNAL_ERROR`，并作为部署/seed 配置错误处理；前端不尝试自行选择租户。
- [ ] 登录、session、权限展示和 `/users` 已迁移路径不再暴露或依赖 `pending`/`disabled` 用户状态，也不再提供启用/停用用户入口；未迁移的旧 mock 文件不作为本条验收失败依据，前提是它们不再参与这些路径。
- [ ] 项目包装的认证 API 路径固定为 `POST /api/auth/login`、`POST /api/auth/logout`、`GET /api/auth/session`；产品前端不以 Better Auth client/route 作为页面契约。
- [ ] `/api/auth/*` 与 `/api/users*` 成功响应 HTTP status 和统一 `ApiSuccessResponse<T>` body shape 符合 PRD 固定契约，Hono RPC typed client 不需要猜测响应结构。
- [ ] `GET /api/auth/session` 的 `data` 返回当前用户、default tenant id 和 `admin/member` 角色，不返回 session token、password hash 或 account internals。
- [ ] `GET /api/auth/session` 对 missing/expired/revoked/no-access/rate-limited session 分别返回 PRD 定义的 HTTP status、standard code 和安全中文 message，前端只把它们映射为 auth state。
- [ ] session `UNAUTHORIZED`、session `FORBIDDEN`、session `INTERNAL_ERROR` 和 session `RATE_LIMITED` 在前端 route gate 中分别进入 PRD 固定的 unauthenticated、no-default-tenant-access 和安全错误状态，四者都不渲染受保护 children。
- [ ] 产品前端、页面测试和验收只调用项目包装的 `/api/auth/*` 与 `/api/users*` API；如实现挂载 Better Auth handler，它只能位于 `/api/_better-auth/*` 且不作为产品页面契约。
- [ ] admin 可以通过后端 API 新增用户；新增用户可以使用设置的密码登录。
- [ ] admin 可以通过后端 API 编辑用户；修改角色后该用户下次登录看到对应权限页面。
- [ ] admin 修改用户姓名、邮箱或角色后，目标用户下一次 session/current-user 或受保护 API 使用最新资料和权限；该类修改本身不要求撤销 session。
- [ ] admin 编辑用户时密码留空不会修改该用户原密码。
- [ ] admin 编辑用户时填写新密码会让该用户只能用新密码登录，并撤销该用户已有 session；若目标是当前 admin，前端成功后强制清缓存并跳转 `/login`。
- [ ] admin 可以通过后端 API 删除用户访问权；实现为 default tenant `tenant_memberships.is_active=false`，用户不能再登录默认租户，默认用户列表不再显示，但历史引用不被级联删除；`membership.is_active=false`、目标用户 session 删除/失效、`user.access_removed` audit 写入必须在同一 DB transaction 成功单元内完成，任一必需步骤失败必须回滚并返回 `INTERNAL_ERROR`。
- [ ] inactive membership 或缺失 default tenant membership 的目标用户不会出现在默认用户列表；直接读取/编辑/删除该目标返回 `NOT_FOUND`。
- [ ] admin 重新新增同邮箱用户时不创建新 `auth_users`，会按 PRD 分支表恢复或创建 default tenant membership 并按新密码登录；若同邮箱 active default tenant 用户已存在则返回 `CONFLICT` 且不修改用户。
- [ ] admin 新增一个已存在 `auth_users` 但缺失 default tenant membership 的同邮箱用户时，不创建新 `auth_users`，而是创建 default tenant membership 并按本次输入覆盖 name/password/role；其他 tenant membership 不作为本任务实现、测试或验收场景。
- [ ] 用户列表 `search` 使用 name/email 的大小写不敏感 contains 匹配；`sort=updated` 和 `sort=name` 都使用 `id` 升序作为稳定 tie-breaker；请求页码超过过滤后总页数时返回空 `items` 并保留规范化后的请求 `page`。
- [ ] 当前登录 admin 不能删除自己或把自己改成 member。
- [ ] `pnpm --filter @kb/db seed:dev-auth` 可重复创建或修复默认租户、admin/member 账号，不在 production 自动运行。
- [ ] 登录、登出、session、admin authorization、用户 CRUD、角色变更、CSRF guard、限流 scope 和 audit action metadata 有后端单元/集成测试覆盖。
- [ ] 前端登录、登出、权限导航、用户管理页面使用 Hono RPC + TanStack Query，不再依赖 mock user store。
- [ ] `pnpm --filter @kb/api test`、`pnpm --filter @kb/api typecheck`、`pnpm --filter @kb/api lint` 通过。
- [ ] `pnpm --filter @kb/web test`、`pnpm --filter @kb/web typecheck`、`pnpm --filter @kb/web lint` 通过。
- [ ] `pnpm --filter @kb/db test`、`pnpm --filter @kb/db typecheck`、`pnpm --filter @kb/db lint` 通过；seed 命令有测试或手动验证记录。

## Definition of Done

- Tests added/updated for backend auth/API, frontend route permission, and user-management behavior.
- `pnpm --filter @kb/web typecheck` passes.
- `pnpm --filter @kb/api typecheck` passes.
- `pnpm --filter @kb/db typecheck` passes when seed/db code changes.
- Relevant lint commands pass for changed packages.
- Relevant web tests pass.
- Relevant API tests pass.
- Relevant DB/seed tests or manual verification pass.
- PRD and implemented behavior stay aligned with backend security/API and frontend API-state conventions.
- Audit spec updated so `user.updated`, `user.access_removed`, and `user.password_reset` are documented action names for this task's implementation.

## Out of Scope (explicit)

- 邀请用户流程、邮件验证流程、找回密码、SSO/OAuth。
- 用户自助找回密码、邮件重置密码、首次登录强制改密。
- 自定义角色管理页面或可配置权限矩阵，除非用户确认必须纳入本任务。
- 知识库级别 ACL 或文档级授权过滤。
- 迁移所有知识库、文档、聊天、任务、provider、audit 页面到真实 API；本任务只迁移登录/session/permission shell 与用户管理所需范围。

## Technical Notes

- Relevant frontend guidelines: `.trellis/spec/frontend/index.md`, `.trellis/spec/frontend/state-management.md`, `.trellis/spec/frontend/lists.md`, `.trellis/spec/frontend/quality-guidelines.md`。
- Relevant backend guidelines: `.trellis/spec/backend/security.md`, `.trellis/spec/backend/api-contract.md`, `.trellis/spec/backend/api-module.md`, `.trellis/spec/backend/audit.md`, `.trellis/spec/backend/database.md`。
- Relevant thinking guide: `.trellis/spec/guides/cross-layer-thinking-guide.md`，因为本任务涉及 auth/session/permission 展示契约。
- Research reference: `research/auth-api-integration.md`。
- User clarified on 2026-05-19 that Redis should be deployed with Docker and Docker Desktop is already running locally.
- Relevant implementation files inspected:
  - `src/apps/api/src/app.ts`
  - `src/apps/api/src/server.ts`
  - `src/packages/auth/src/index.ts`
  - `src/packages/users/src/index.ts`
  - `src/packages/db/src/schema/auth.ts`
  - `src/packages/db/src/schema/tenant.ts`
  - `src/packages/db/src/schema/audit.ts`
  - `src/apps/web/src/features/mock/types.ts`
  - `src/apps/web/src/features/mock/seed.ts`
  - `src/apps/web/src/features/mock/store.tsx`
  - `src/apps/web/src/features/mock/selectors.ts`
  - `src/apps/web/src/features/auth/login-page.tsx`
  - `src/apps/web/src/features/shell/app-shell.tsx`
  - `src/apps/web/src/features/shell/navigation.ts`
  - `src/apps/web/src/features/admin/admin-list-page.tsx`
  - `src/apps/web/src/features/admin/user-dialog.tsx`
- Existing unrelated dirty file: `src/apps/web/next-env.d.ts`; do not overwrite or revert without explicit user instruction.
