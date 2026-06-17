# 统一后端错误处理机制重构

## Goal

重构当前后端错误处理机制，建立一个后端统一导出的错误包，让接口类异常由业务包或 API guard/middleware 抛出统一错误对象，并由 API 层统一转换为现有 `ApiErrorResponse` 返回给前端；后台任务类异常不作为接口响应抛出，但必须按本 PRD 定义的允许记录字段写入日志，并拒绝写入本 PRD 定义的禁止记录字段。

## What I Already Know

- 当前项目已有公共 API 响应结构，定义在 `src/packages/shared/src/index.ts`：`ApiErrorCode`、`ApiValidationError`、`ApiErrorResponse`。
- 当前 `src/apps/api/src/app.ts` 已有全局 `app.onError`，但只把未知异常统一转成 `INTERNAL_ERROR/500`。
- 当前多个业务包各自定义 service error：
  - `src/packages/users/src/service-errors.ts`
  - `src/packages/knowledge/src/service/errors.ts`
  - `src/packages/ai-providers/src/shared/service-types.ts`
  - `src/packages/rag/src/service-types.ts`
- 当前 API procedures 大量使用 `respondWithServiceError` 手动转换业务错误，目标是逐步删除这类重复处理。
- 当前后台 worker 已有部分错误日志处理，但 recovery interval 仍存在未统一捕获记录的问题。
- 用户已确认：
  - 新增独立 `@kb/errors` 包。
  - `responseHeaders` 允许进入 `AppError`，但必须严格限制字段。
  - `metadata` 允许进入 `AppError`，但必须严格白名单并在质量门禁检查。
  - 当前需求不修改 ingestion 的持久化错误字段，如 `lastErrorCode` / `uploadErrorCode`。
  - 必须先修改测试文件，再修改对应的被测试文件。

## Requirements

### R1. 新增统一后端错误包

新增 `@kb/errors` 包，路径为 `src/packages/errors`。

必须创建：

- `src/packages/errors/package.json`
- `src/packages/errors/tsconfig.json`
- `src/packages/errors/src/index.ts`
- `src/packages/errors/src/index.test.ts`

`@kb/errors` 必须导出：

- `AppError`
- `AppErrorData`
- `AppErrorDomain`
- `AppErrorReason`
- `AppErrorMetadata`
- `AppErrorResponseHeaders`
- `appErrorDataSchema`
- `isAppError`
- `normalizeUnknownError`
- `createAppError`
- factory functions:
  - `unauthorized`
  - `forbidden`
  - `notFound`
  - `conflict`
  - `validationError`
  - `rateLimited`
  - `payloadTooLarge`
  - `unsupportedMediaType`
  - `providerUnavailable`
  - `internalError`

`@kb/errors` 依赖：

- `@kb/shared`
- `zod`

### R2. AppError 数据结构必须严格校验

`AppErrorData` 必须包含以下字段：

```ts
interface AppErrorData {
  code: ApiErrorCode;
  httpStatus: 400 | 401 | 403 | 404 | 409 | 413 | 415 | 429 | 500;
  message: string;
  validationErrors?: ApiValidationError[];
  domain: AppErrorDomain;
  reason: AppErrorReason;
  retryable?: boolean;
  metadata?: AppErrorMetadata;
  responseHeaders?: AppErrorResponseHeaders;
}
```

`AppErrorDomain` 只允许：

```ts
type AppErrorDomain =
  | "api"
  | "auth"
  | "users"
  | "knowledge"
  | "documents"
  | "providers"
  | "rag"
  | "ingestion"
  | "worker"
  | "queue"
  | "search"
  | "storage"
  | "db"
  | "security"
  | "audit";
```

`AppErrorReason` 必须是非空 snake_case 字符串。示例：

- `bad_origin`
- `invalid_content_type`
- `invalid_request_body`
- `rate_limited`
- `access_removed`
- `duplicate_email`
- `duplicate_knowledge_base_name`
- `object_upload_failed`
- `queue_enqueue_failed`
- `provider_auth_failed`
- `provider_rate_limited`
- `keyword_search_failed`
- `unexpected_error`

### R3. responseHeaders 必须严格白名单

`AppErrorResponseHeaders` 只允许：

```ts
interface AppErrorResponseHeaders {
  retryAfterSeconds?: number;
  setCookie?: string[];
}
```

允许规则：

- `retryAfterSeconds`
  - 只用于 `code: "RATE_LIMITED"`。
  - 必须是整数。
  - 范围 `1..86400`。
  - API 层转换成 `Retry-After` 响应头。
- `setCookie`
  - 只用于 `domain: "auth"`。
  - 只用于认证 cookie 清理或刷新。
  - API 层转换成多个 `Set-Cookie` 响应头。
  - 禁止进入 JSON body。
  - 禁止进入日志。

禁止字段：

- `Location`
- `Authorization`
- 任意 `X-*`
- 任意用户输入 header
- 任意未在 `AppErrorResponseHeaders` 中声明的 header

`responseHeaders` schema 必须是 strict object，未知字段必须校验失败。

### R4. metadata 必须严格白名单

`AppErrorMetadata` 只允许：

```ts
interface AppErrorMetadata {
  requestId?: string;
  tenantId?: string;
  actorId?: string;
  targetUserId?: string;
  knowledgeBaseId?: string;
  documentId?: string;
  documentSourceId?: string;
  ingestionJobId?: string;
  providerConfigId?: string;
  retrievalRunId?: string;
  queueName?: "ingestion" | "maintenance";
  jobId?: string;
  operation?: string;
  path?: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS" | "HEAD";
  contentLength?: number;
  maxBytes?: number;
  retryAttempt?: number;
}
```

`AppErrorMetadata` 字段取值约束：

- `requestId`、`tenantId`、`actorId`、`targetUserId`、`knowledgeBaseId`、`documentId`、`documentSourceId`、`ingestionJobId`、`providerConfigId`、`retrievalRunId`、`jobId` 只能记录系统生成的 ID 字符串。
- `queueName` 只能记录 `"ingestion"` 或 `"maintenance"`。
- `operation` 只能记录代码中硬编码的 snake_case 操作名，例如 `create_user`、`upload_document_file`、`recover_ingestion_jobs`；禁止使用用户输入生成。
- `path` 只能记录 API 路由路径，不包含 query string，例如 `/api/users/:userId` 或 `/api/knowledge-bases/:knowledgeBaseId`；禁止记录完整 URL、请求体、文件路径、对象存储 key。
- `method` 只能记录 HTTP 方法枚举。
- `contentLength`、`maxBytes`、`retryAttempt` 只能记录非负整数。

禁止进入 `metadata` 和错误日志 payload 的字段名或数据类别：

- 密码字段：`password`、`currentPassword`、`newPassword`、`confirmPassword`、`passwordHash`。
- API key 字段：`apiKey`、`providerApiKey`、`openaiApiKey`、`encryptedApiKey`、`decryptedApiKey`。
- token 字段：`token`、`accessToken`、`refreshToken`、`idToken`、`bearerToken`、`csrfToken`、`sessionToken`、`verificationToken`、`resetToken`。
- cookie 字段：`cookie`、`cookies`、`sessionCookie`、`Cookie`、`Set-Cookie`、`setCookie`。
- authorization header 字段：`authorization`、`Authorization`、`proxyAuthorization`、`Proxy-Authorization`。
- 原始请求/响应 header 对象：`headers`、`requestHeaders`、`responseHeaders`。
- 原始请求/响应 body 字段：`body`、`requestBody`、`responseBody`、`rawBody`、`jsonBody`、`formData`、`multipartBody`。
- provider 交互内容：`providerRequestBody`、`providerResponseBody`、`providerPrompt`、`providerCompletion`、`prompt`、`completion`。
- 聊天正文：`question`、`answer`、`messageContent`、`chatMessage`。
- 文档正文：`documentText`、`rawText`、`extractedText`、`pageText`、`markdown`、`plainText`。
- chunk 内容：`chunkText`、`chunkContent`、`chunks`。
- embedding/vector 内容：`embedding`、`embeddings`、`vector`、`vectors`。
- 文件内容：`file`、`fileBuffer`、`buffer`、`bytes`、`arrayBuffer`、`blob`、`base64`。
- 数据库连接和 SQL：`DATABASE_URL`、`databaseUrl`、`connectionString`、`sql`、`rawSql`、`queryText`、`queryParams`。
- Redis/S3/AWS 凭据：`REDIS_URL`、`redisUrl`、`S3_SECRET_ACCESS_KEY`、`AWS_SECRET_ACCESS_KEY`、`AWS_ACCESS_KEY_ID`、`awsSecretAccessKey`、`awsAccessKeyId`。
- 加密材料：`APP_ENCRYPTION_KEY`、`encryptionKey`、`privateKey`、`decryptedSecret`、`encryptedSecret`。
- 任意未经过 `AppErrorMetadata` schema 校验的对象。

`metadata` schema 必须是 strict object，未知字段必须校验失败。

### R5. API 层统一处理接口异常

`src/apps/api/src/app.ts` 的 `app.onError` 必须：

- 识别 `AppError`。
- 将 `AppError` 转换为现有 `ApiErrorResponse`。
- 将 `responseHeaders.retryAfterSeconds` 写成 `Retry-After`。
- 将 `responseHeaders.setCookie` 写成多个 `Set-Cookie`。
- 只允许记录以下日志字段：
  - `code`
  - `httpStatus`
  - `domain`
  - `reason`
  - `retryable`
  - `metadata`
  - `error.message`
  - `error.stack`
- 不记录 `responseHeaders`。
- 禁止记录 R4 中列出的字段名或数据类别。
- 对普通 `Error` 或 unknown 异常继续返回 `INTERNAL_ERROR/500`。

### R6. API 自身 guard/middleware 也必须抛 AppError

以下 API 自身产生的接口错误必须迁移到 `AppError`：

- 请求体验证失败。
- Zod body/query/params 校验失败。
- Origin / Fetch metadata 校验失败。
- Content-Type 校验失败。
- auth 未登录。
- auth access removed。
- rate limit。
- upload concurrency limit。
- upload content length / multipart / file validation 失败。

### R7. 业务包接口错误由业务包抛出

以下接口型业务包必须逐步从 `{ ok: false, error }` 或自定义 service error 迁移为抛 `AppError`：

- `@kb/users`
- `@kb/knowledge`
- `@kb/ai-providers` 的 provider config service 部分
- `@kb/rag` 的接口级错误部分

API procedure 目标状态：

- 正常路径只解析输入、调用 service、返回 success response。
- 错误路径不再手动 `respondWithServiceError`。
- 错误统一交给 `app.onError`。

### R8. 后台任务错误不作为接口异常抛出，但必须按固定字段记录

`@kb/worker` 必须新增或改造后台任务错误记录 helper。

要求：

- recovery interval 不能裸 `void runRecovery(...)`。
- source cleanup catch 不能只记录 `failed: 1`。
- 后台任务捕获 `AppError` 时只允许记录以下字段：
  - `code`
  - `httpStatus`
  - `domain`
  - `reason`
  - `retryable`
  - `metadata`
  - `error.message`
  - `error.stack`
- 后台任务捕获普通 `Error` 时记录：
  - `error.message`
  - `error.stack`
  - `taskName`
- 禁止记录 `responseHeaders`。
- 禁止记录 R4 中列出的字段名或数据类别。
- BullMQ ingestion job retry 语义不变：
  - `shouldRetry: true` 继续抛普通 `Error` 交给 BullMQ 重试。
  - `shouldRetry: false` 继续抛 `UnrecoverableError`。

### R9. 测试必须先于被测文件修改

实施每个包或每个行为迁移时，必须遵守：

1. 先修改或新增测试文件。
2. 运行该测试，确认失败原因与目标行为一致。
3. 再修改对应被测试文件。
4. 再运行同一测试，确认通过。
5. 再运行对应 package 测试。

禁止先改实现再补测试。

## Package Scope

### Must Modify

#### `@kb/errors`

新增包。

Files:

- `src/packages/errors/package.json`
- `src/packages/errors/tsconfig.json`
- `src/packages/errors/src/index.ts`
- `src/packages/errors/src/index.test.ts`

#### `@kb/api`

Files likely requiring modification:

- `src/apps/api/package.json`
- `src/apps/api/src/app.ts`
- `src/apps/api/src/http/responses.ts`
- `src/apps/api/src/http/service-errors.ts`
- `src/apps/api/src/http/cookies.ts`
- `src/apps/api/src/contracts/services.ts`
- `src/apps/api/src/runtime/defaults.ts`
- `src/apps/api/src/runtime/services.ts`
- `src/apps/api/src/middleware/validation.ts`
- `src/apps/api/src/middleware/mutation.ts`
- `src/apps/api/src/middleware/auth.ts`
- `src/apps/api/src/middleware/upload.ts`
- `src/apps/api/src/guards/mutation.ts`
- `src/apps/api/src/guards/session/admin-session.ts`
- `src/apps/api/src/guards/session/knowledge-session.ts`
- `src/apps/api/src/guards/session/audit.ts`
- `src/apps/api/src/guards/session/rate-limits.ts`
- `src/apps/api/src/guards/session/types.ts`
- `src/apps/api/src/modules/auth/lib/errors.ts`
- `src/apps/api/src/modules/auth/lib/better-auth-service.ts`
- `src/apps/api/src/modules/users/procedures/create-user.ts`
- `src/apps/api/src/modules/users/procedures/get-user.ts`
- `src/apps/api/src/modules/users/procedures/list-users.ts`
- `src/apps/api/src/modules/users/procedures/update-user.ts`
- `src/apps/api/src/modules/users/procedures/remove-user-access.ts`
- `src/apps/api/src/modules/knowledge-bases/procedures/create-knowledge-base.ts`
- `src/apps/api/src/modules/knowledge-bases/procedures/get-knowledge-base.ts`
- `src/apps/api/src/modules/knowledge-bases/procedures/list-knowledge-bases.ts`
- `src/apps/api/src/modules/knowledge-bases/procedures/update-knowledge-base.ts`
- `src/apps/api/src/modules/documents/procedures/upload-document-file.ts`
- `src/apps/api/src/modules/documents/procedures/list-document-processing.ts`
- `src/apps/api/src/modules/documents/procedures/retry-document-processing.ts`
- `src/apps/api/src/modules/providers/procedures/list-providers.ts`
- `src/apps/api/src/modules/providers/procedures/save-provider.ts`
- `src/apps/api/src/modules/chat/procedures/helpers.ts`
- `src/apps/api/src/modules/chat/procedures/*.ts`
- `src/apps/api/src/modules/documents/lib/upload-request.ts`
- `src/apps/api/src/modules/documents/lib/file-validation.ts`
- `src/apps/api/src/modules/documents/lib/upload-audit.ts`
- `src/apps/api/src/testing/fakes.ts`

Associated tests:

- `src/apps/api/src/http/error-handling.test.ts`
- `src/apps/api/src/modules/auth/**/*.test.ts`
- `src/apps/api/src/modules/users/**/*.test.ts`
- `src/apps/api/src/modules/knowledge-bases/**/*.test.ts`
- `src/apps/api/src/modules/documents/**/*.test.ts`
- `src/apps/api/src/modules/providers/**/*.test.ts`
- `src/apps/api/src/modules/chat/**/*.test.ts`
- `src/apps/api/src/runtime/**/*.test.ts`

#### `@kb/users`

Files likely requiring modification:

- `src/packages/users/package.json`
- `src/packages/users/src/service-errors.ts`
- `src/packages/users/src/service-types.ts`
- `src/packages/users/src/service.ts`
- `src/packages/users/src/index.ts`
- `src/packages/users/src/service-plans.ts`
- `src/packages/users/src/domain-errors.ts`
- `src/packages/users/src/plans.ts`
- `src/packages/users/src/operations/create-user.ts`
- `src/packages/users/src/operations/update-user.ts`
- `src/packages/users/src/operations/remove-user-access.ts`
- `src/packages/users/src/operations/get-user.ts`
- `src/packages/users/src/operations/list-users.ts`

Associated tests:

- `src/packages/users/src/index.test.ts`
- `src/packages/users/src/service.test.ts`
- Any `users` package tests referencing `ok: false`, `UserServiceError`, `toServiceException`, or `fromServiceException`.

#### `@kb/knowledge`

Files likely requiring modification:

- `src/packages/knowledge/package.json`
- `src/packages/knowledge/src/service/errors.ts`
- `src/packages/knowledge/src/service/types.ts`
- `src/packages/knowledge/src/service.ts`
- `src/packages/knowledge/src/index.ts`
- `src/packages/knowledge/src/operations/knowledge-bases/create.ts`
- `src/packages/knowledge/src/operations/knowledge-bases/update.ts`
- `src/packages/knowledge/src/operations/knowledge-bases/list.ts`
- `src/packages/knowledge/src/operations/knowledge-bases/get.ts`
- `src/packages/knowledge/src/operations/upload-document-file/index.ts`
- `src/packages/knowledge/src/operations/upload-document-file/access/authorization.ts`
- `src/packages/knowledge/src/operations/upload-document-file/shared/types.ts`
- `src/packages/knowledge/src/operations/upload-document-file/shared/constants.ts`
- `src/packages/knowledge/src/operations/upload-document-file/metadata/reservation.ts`
- `src/packages/knowledge/src/operations/upload-document-file/lifecycle/failures.ts`
- `src/packages/knowledge/src/operations/upload-document-file/lifecycle/finalization.ts`
- `src/packages/knowledge/src/operations/document-processing/retry.ts`
- `src/packages/knowledge/src/service/mappers.ts`
- `src/packages/knowledge/src/service/queries.ts`

Associated tests:

- `src/packages/knowledge/src/**/*.test.ts`

#### `@kb/ai-providers`

Files likely requiring modification:

- `src/packages/ai-providers/package.json`
- `src/packages/ai-providers/src/shared/service-types.ts`
- `src/packages/ai-providers/src/shared/provider-service-errors.ts`
- `src/packages/ai-providers/src/provider-config/provider-config-service.ts`
- `src/packages/ai-providers/src/provider-config/provider-secrets.ts`
- `src/packages/ai-providers/src/provider-config/provider-config-summary.ts`
- `src/packages/ai-providers/src/repositories/provider-repository-drizzle.ts`

Associated tests:

- `src/packages/ai-providers/src/provider-config/**/*.test.ts`
- `src/packages/ai-providers/src/connection/**/*.test.ts` if mapping signatures change.

Do not refactor provider runtime and embedding result semantics in this task unless required by type compatibility:

- `src/packages/ai-providers/src/embedding/embedding-service.ts`
- `src/packages/ai-providers/src/runtime/runtime-service.ts`
- `src/packages/ai-providers/src/connection/connection-tester.ts`

#### `@kb/rag`

Files likely requiring modification:

- `src/packages/rag/package.json`
- `src/packages/rag/src/service-types.ts`
- `src/packages/rag/src/service-helpers.ts`
- `src/packages/rag/src/service.ts`

Possible service-layer wrapping points:

- `src/packages/rag/src/drizzle-repository.ts`
- `src/packages/rag/src/drizzle-runs.ts`
- `src/packages/rag/src/drizzle-records.ts`
- `src/packages/rag/src/drizzle-feedback.ts`

Repository invariant throws may remain plain `Error`; expected interface errors must become `AppError`.

Associated tests:

- `src/packages/rag/src/service.test.ts`
- Any RAG tests asserting old `{ ok: false }` interface errors.

#### `@kb/worker`

Files likely requiring modification:

- `src/apps/worker/package.json`
- `src/apps/worker/src/lifecycle.ts`
- `src/apps/worker/src/lifecycle.test.ts`
- Optional new file: `src/apps/worker/src/task-errors.ts`
- `src/apps/worker/src/index.ts` only if needed for job-level logging.

#### `@kb/observability`

Files requiring modification after code review:

- `src/packages/observability/src/index.ts`
- `src/packages/observability/src/index.test.ts`

Reason:

- Owns shared logger helpers.
- Provides `createSafeErrorLogFields` so API, worker, and business packages do not duplicate unsafe unknown-error logging behavior.
- Must not depend on `@kb/errors`; `AppError` classification stays in API/business/worker boundaries.

### Must Not Modify In This Task

#### `@kb/web`

Frontend is explicitly out of scope.

#### `@kb/db`

Do not change database schema or migrations.

Do not modify persisted error fields:

- `lastErrorCode`
- `lastErrorMessage`
- `uploadErrorCode`
- `uploadErrorMessage`
- `objectCleanupErrorCode`
- `objectCleanupErrorMessage`
- retrieval run `errorCode`
- retrieval run `errorMessage`

#### `@kb/ingestion`

Do not change the ingestion persistence model or pipeline result contract in this task.

Keep:

- `IngestionError`
- `IngestionPipelineResult`
- `retryable`
- `shouldRetry`
- current persisted error code fields

#### `@kb/shared`

Do not move `ApiErrorCode`, `ApiValidationError`, or `ApiErrorResponse` out of `@kb/shared`.

Only modify `@kb/shared` if `@kb/errors` requires a small exported type that already conceptually belongs in shared. This should be avoided unless typecheck proves it necessary.

#### Infrastructure Packages Normally Not Modified

Do not directly introduce `AppError` into these packages unless typecheck or package boundaries require it:

- `@kb/search`
- `@kb/storage`
- `@kb/security`
- `@kb/queue`
- `@kb/audit`
- `@kb/config`
- `@kb/auth`

Errors from these packages should be wrapped by API/business/worker boundaries.

## Migration Plan

### Phase 1. Add `@kb/errors`

1. Update tests first:
   - Add schema validation tests.
   - Add `responseHeaders` whitelist tests.
   - Add `metadata` whitelist tests.
   - Add tests for the forbidden `metadata` field names listed in R4.
   - Add factory status/code tests.
   - Add `isAppError` tests.
2. Implement `@kb/errors`.
3. Run `pnpm --filter @kb/errors test`.
4. Run `pnpm --filter @kb/errors typecheck`.

### Phase 2. API Global Boundary Compatibility

1. Update `src/apps/api/src/http/error-handling.test.ts` first.
2. Add tests for:
   - thrown `AppError` -> exact JSON response.
   - `retryAfterSeconds` -> `Retry-After`.
   - `setCookie` -> `Set-Cookie`, not JSON body.
   - unknown `Error` -> `INTERNAL_ERROR/500`.
   - logs exclude `responseHeaders.setCookie`.
3. Modify `src/apps/api/src/app.ts` and related helpers.
4. Run `pnpm --filter @kb/api test -- src/http/error-handling.test.ts` if supported by the package test runner; otherwise run `pnpm --filter @kb/api test`.

### Phase 3. API Guard and Middleware Errors

1. Update relevant API guard/middleware tests first.
2. Migrate validation, mutation guard, auth middleware, upload middleware, rate limit, and session guards to throw `AppError`.
3. Keep response shape identical.
4. Run `pnpm --filter @kb/api test`.

### Phase 4. `@kb/users`

1. Update users package tests first.
2. Update API users router/procedure tests first.
3. Migrate users service operations to throw `AppError`.
4. Update API users procedures to remove manual `respondWithServiceError`.
5. Run:
   - `pnpm --filter @kb/users test`
   - `pnpm --filter @kb/api test`

### Phase 5. `@kb/knowledge`

1. Update knowledge package tests first.
2. Update API knowledge/documents tests first.
3. Migrate expected interface errors to `AppError`.
4. Keep ingestion persisted error fields unchanged.
5. Keep public document processing error message mapping intact.
6. Run:
   - `pnpm --filter @kb/knowledge test`
   - `pnpm --filter @kb/api test`

### Phase 6. `@kb/ai-providers`

1. Update provider config tests first.
2. Update API providers tests first.
3. Migrate provider config service expected interface errors to `AppError`.
4. Keep embedding/runtime provider result semantics unchanged.
5. Run:
   - `pnpm --filter @kb/ai-providers test`
   - `pnpm --filter @kb/api test`

### Phase 7. `@kb/rag`

1. Update RAG service tests first.
2. Update API chat tests first.
3. Migrate expected interface errors to `AppError`.
4. Keep provider degradation behavior unchanged.
5. Wrap expected keyword search failures if they represent user-facing interface failures.
6. Run:
   - `pnpm --filter @kb/rag test`
   - `pnpm --filter @kb/api test`

### Phase 8. `@kb/worker`

1. Update worker lifecycle tests first.
2. Add tests for recovery interval error logging.
3. Add tests for source cleanup logging that uses only the fields listed in R8.
4. Add tests proving `Set-Cookie` / `responseHeaders` are not logged.
5. Implement scheduled task error logging helper.
6. Preserve BullMQ retry behavior.
7. Run `pnpm --filter @kb/worker test`.

### Phase 9. Remove Compatibility Layer

1. Search old patterns.
2. Update tests first for removal if needed.
3. Remove:
   - `respondWithServiceError`
   - `ApiServiceError` if no longer needed
   - `toServiceException`
   - `fromServiceException`
   - package-specific interface error exports where replaced
4. Run full quality gate.

## Acceptance Criteria

- [ ] `@kb/errors` exists and exports the unified backend error model.
- [ ] `AppErrorData` is validated with Zod.
- [ ] `metadata` rejects unknown fields.
- [ ] `responseHeaders` rejects unknown fields.
- [ ] `retryAfterSeconds` only works for `RATE_LIMITED`.
- [ ] `setCookie` only works for `domain: "auth"`.
- [ ] API `app.onError` converts `AppError` to existing `ApiErrorResponse`.
- [ ] API `app.onError` continues to convert unknown errors to `INTERNAL_ERROR/500`.
- [ ] API logs include only the fields listed in R5.
- [ ] API logs never include any field name or data category listed in R4's forbidden list.
- [ ] API guard/middleware expected errors throw `AppError`.
- [ ] `users`, `knowledge`, provider config service, and `rag` expected interface errors throw `AppError`.
- [ ] API procedures no longer manually convert migrated service errors.
- [ ] Worker scheduled task errors are caught and logged using only the fields listed in R8.
- [ ] Worker BullMQ retry semantics are unchanged.
- [ ] Ingestion persisted error fields remain unchanged.
- [ ] Frontend remains unchanged.

## Quality Gate

Run package tests:

```bash
pnpm --filter @kb/errors test
pnpm --filter @kb/api test
pnpm --filter @kb/users test
pnpm --filter @kb/knowledge test
pnpm --filter @kb/ai-providers test
pnpm --filter @kb/rag test
pnpm --filter @kb/worker test
```

Run repo checks:

```bash
pnpm typecheck
pnpm lint
pnpm test
```

Run old-pattern scan:

```bash
rg -n "respondWithServiceError|ApiServiceError|toServiceException|fromServiceException|serviceError" src/apps/api src/packages
```

Expected result:

- No remaining production usage after compatibility cleanup.
- Any remaining test or documentation usage must be intentionally justified.

Run interface-error result scan:

```bash
rg -n "ok: false" src/apps/api src/packages/users src/packages/knowledge src/packages/ai-providers/src/provider-config src/packages/rag
```

Expected result:

- Interface-style expected errors should not use `ok: false`.
- Allowed remaining uses must be internal parse/result flows, provider runtime/embedding, or ingestion pipeline semantics.

Run response header and metadata scan:

```bash
rg -n "Retry-After|Set-Cookie|responseHeaders|metadata" src/apps/api src/apps/worker src/packages/errors src/packages/observability
```

Expected result:

- `Retry-After` only comes from `responseHeaders.retryAfterSeconds`.
- `Set-Cookie` only comes from `responseHeaders.setCookie`.
- `setCookie` is not logged.
- `metadata` only uses `AppErrorMetadata` whitelist fields.

Run forbidden error-log content scan:

```bash
rg -n "password|currentPassword|newPassword|confirmPassword|passwordHash|apiKey|providerApiKey|openaiApiKey|encryptedApiKey|decryptedApiKey|token|accessToken|refreshToken|idToken|bearerToken|csrfToken|sessionToken|verificationToken|resetToken|cookie|cookies|sessionCookie|Set-Cookie|setCookie|authorization|Authorization|proxyAuthorization|Proxy-Authorization|requestHeaders|responseHeaders|requestBody|responseBody|rawBody|jsonBody|formData|multipartBody|providerRequestBody|providerResponseBody|providerPrompt|providerCompletion|prompt|completion|question|answer|messageContent|chatMessage|documentText|rawText|extractedText|pageText|markdown|plainText|chunkText|chunkContent|chunks|embedding|embeddings|vector|vectors|fileBuffer|arrayBuffer|blob|base64|DATABASE_URL|databaseUrl|connectionString|rawSql|queryText|queryParams|REDIS_URL|redisUrl|S3_SECRET_ACCESS_KEY|AWS_SECRET_ACCESS_KEY|AWS_ACCESS_KEY_ID|awsSecretAccessKey|awsAccessKeyId|APP_ENCRYPTION_KEY|encryptionKey|privateKey|decryptedSecret|encryptedSecret" src/apps/api src/apps/worker src/packages/errors src/packages/users src/packages/knowledge src/packages/ai-providers src/packages/rag src/packages/observability
```

Expected result:

- No field name or data category listed in R4's forbidden list is written to `metadata`.
- No field name or data category listed in R4's forbidden list is written to error log payload.
- Any hit must be removed unless the implementation notes list the exact file, line number, matched word, and a reason proving the matched value is not written to `metadata` and is not written to an error log payload.

## Out of Scope

- Frontend changes.
- Database schema changes.
- Ingestion persisted error field migration.
- Replacing `IngestionPipelineResult`.
- Replacing provider embedding/runtime result semantics.
- Changing BullMQ retry policy.
- Introducing arbitrary response headers in `AppError`.
- Logging raw request bodies, provider request bodies, provider response bodies, document bodies, chunks, embeddings, cookies, tokens, password fields, API key fields, authorization headers, database connection strings, Redis URLs, S3 credentials, AWS credentials, encryption keys, private keys, file buffers, or base64 file content.

## Technical Notes

- Workspace automatically includes `src/packages/*`, so `src/packages/errors` will be included by `pnpm-workspace.yaml`.
- Existing packages use `exports: { ".": "./src/index.ts" }`; `@kb/errors` should follow the same pattern.
- Current public API response contract stays in `@kb/shared`.
- `@kb/errors` should depend on `@kb/shared`, not the reverse.
- Implementation must proceed test-first: modify the relevant test file before modifying the corresponding production file.
