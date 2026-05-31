# 拆分 API Session Guard 逻辑

## Goal

拆分 `src/apps/api/src/guards/session.ts` 中混合在一起的 session resolution、admin authorization、domain rate limit、unresolved-request rate limit、request IP summary 等逻辑，让 API guard 边界更清晰、测试更聚焦，同时保持现有 HTTP 行为、公开导出和 API contract 不变。

## What I already know

- 用户明确要求创建任务，并在开始实现前再次确认影响边界。
- 本任务只针对 API Session Guard 相关逻辑，允许创建文件夹。
- 工作必须严格遵守后端开发 spec，尤其是 API module、API contract、security、audit、package boundaries、testing、shared TypeScript/code quality 规范。
- 当前大文件为 `src/apps/api/src/guards/session.ts`，导出：
  - `requireAdminUserManagementSession`
  - `respondAfterUnresolvedUserManagementRateLimit`
  - `requireKnowledgeBaseSession`
  - `requireAdminKnowledgeBaseSession`
  - `respondAfterUnresolvedKnowledgeBaseRateLimit`
  - `respondAfterUnresolvedDocumentUploadRateLimit`
  - `rateLimitLogin`
  - `getLoginRateLimitEmail`
  - `rateLimitAuthSession`
  - `rateLimitDocumentUpload`
  - `getRequestIpSummary`
- `src/apps/api/src/guards/index.ts` 目前通过 `export * from "./session"` 对外暴露 guard API。
- 主要消费者在 `src/apps/api/src/modules/auth/*`、`users/*`、`knowledge-bases/*`、`providers/*`、`documents/*`、`chat/*`。
- 当前相关测试覆盖在：
  - `src/apps/api/src/modules/auth/router.test.ts`
  - `src/apps/api/src/modules/users/router.test.ts`
  - `src/apps/api/src/modules/knowledge-bases/router.test.ts`
  - `src/apps/api/src/modules/providers/router.test.ts`
  - `src/apps/api/src/modules/chat/router.test.ts`
  - `src/apps/api/src/modules/documents/procedures/upload-document-file/**`
  - `src/apps/api/src/guards/mutation.test.ts`
- 文档上传 API 测试和 knowledge upload operation 在当前 `main` 已经被拆分成多文件结构，不再是单个 oversized test 文件。

## Assumptions

- 这是结构性重构，不新增业务能力。
- 公开导出名、函数签名、错误 envelope、HTTP status、rate-limit scope/identity/limit/window、Set-Cookie 转发行为、admin forbidden audit 行为都必须保持兼容。
- 允许把 `session.ts` 改为 barrel/re-export 文件，或保留为小型入口文件。
- 不把 API/Hono-specific guard 逻辑移动到 `src/packages/security`，因为这些逻辑依赖 Hono context、API response helpers、AuditService、AuthService、ApiRateLimiter。

## Impact Boundary To Confirm

### In Scope

- `src/apps/api/src/guards/session.ts`
- New files/folders under `src/apps/api/src/guards/session/` or equivalent API-local guard folder.
- `src/apps/api/src/guards/index.ts` only if needed to preserve exports.
- Focused tests for split helper behavior if current route-level tests do not directly cover the extracted boundary.
- Existing route tests may be adjusted only when import paths or test organization require it, without changing behavior assertions.

### Behavior That Must Not Change

- `auth` scope:
  - login rate limit remains `30 / 15m`.
  - session/logout rate limit remains `120 / 1m`.
  - malformed login bodies still rate-limit before validation when current route does so.
- `user-management` scope:
  - authenticated actor identity remains `tenantId + actorId`, `120 / 1m`.
  - unresolved identity remains IP-based, `60 / 1m`.
  - member access to admin user-management still records `auth.forbidden`.
- `knowledge-base` scope:
  - authenticated actor identity remains `tenantId + actorId`, `120 / 1m`.
  - unresolved identity remains IP-based, `60 / 1m`.
  - member access to admin knowledge/provider mutations still records `auth.forbidden`.
- `document-upload` scope:
  - authenticated actor identity remains `tenantId + actorId`.
  - unresolved identity remains IP-based.
  - caller-supplied upload limit remains respected.
- API response contract:
  - all errors remain `ApiErrorResponse` via existing response helpers.
  - `Retry-After` header remains set when rate limited.
  - auth service cleanup cookies continue to be appended on failed session resolution.
- `getRequestIpSummary` fallback remains `127.0.0.1`.

### Out of Scope

- Changing auth/session business behavior.
- Introducing new middleware order.
- Moving domain authorization into packages.
- Changing rate-limit policy values.
- Changing API route contracts or Hono RPC schemas.
- Frontend changes.
- DB/schema changes.
- Provider, knowledge, document upload, or user domain service changes except tests that directly exercise API guard behavior.

## Recommended Split Shape

Recommended approach: keep a stable public entrypoint and split internal responsibilities:

```text
src/apps/api/src/guards/session.ts          # re-export / compatibility entry
src/apps/api/src/guards/session/
  admin-session.ts                         # admin user-management + admin knowledge-base guards
  knowledge-session.ts                     # authenticated knowledge-base guard
  rate-limits.ts                           # auth/user-management/knowledge/document upload limiter helpers
  request.ts                               # request IP summary and small request helpers
  audit.ts                                 # forbidden admin audit helper, if extraction stays small
  types.ts                                 # shared guard result/input types, if useful
```

If implementation shows `audit.ts` or `types.ts` would be too small or less clear, keep those helpers colocated in the closest file.

## Acceptance Criteria

- [ ] `src/apps/api/src/guards/session.ts` is reduced to a small stable entrypoint or otherwise split into focused files.
- [ ] Existing imports from `../../../guards` and `../guards` continue to work.
- [ ] No public guard function signature changes unless explicitly approved.
- [ ] Rate-limit identities, scopes, limits, window labels, and windows remain behaviorally identical.
- [ ] Admin forbidden audit behavior remains identical for user-management and knowledge/provider admin routes.
- [ ] API envelope behavior and cleanup cookie forwarding remain identical.
- [ ] Relevant API/guard tests pass.
- [ ] `pnpm --filter @kb/api test`, `pnpm --filter @kb/api typecheck`, and applicable lint/typecheck commands are run or blockers are recorded.

## Definition of Done

- Tests added/updated where extraction creates new standalone logic.
- Lint/typecheck/test verification completed for the API package at minimum.
- No behavior changes outside the confirmed boundary.
- No frontend, database, or package-domain changes.
- Spec update considered at finish; update only if new project convention is learned.

## Technical Notes

- Specs read for planning:
  - `.trellis/spec/backend/index.md`
  - `.trellis/spec/backend/api-module.md`
  - `.trellis/spec/backend/api-contract.md`
  - `.trellis/spec/backend/security.md`
  - `.trellis/spec/backend/audit.md`
  - `.trellis/spec/backend/package-boundaries.md`
  - `.trellis/spec/backend/logging.md`
  - `.trellis/spec/backend/observability.md`
  - `.trellis/spec/backend/performance.md`
  - `.trellis/spec/testing/strategy.md`
  - `.trellis/spec/shared/typescript.md`
  - `.trellis/spec/shared/code-quality.md`
  - `.trellis/spec/guides/code-reuse-thinking-guide.md`
  - `.trellis/spec/guides/cross-layer-thinking-guide.md`
- Current branch at task creation: `main`; working tree was clean before task files were created.
