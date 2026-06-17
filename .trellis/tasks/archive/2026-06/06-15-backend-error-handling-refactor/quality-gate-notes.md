# Quality Gate Notes

## Code Review Fix Verification Run

Scope:

- Fixed unsafe raw unknown-error logging found in code review.
- Fixed provider transport ciphertext decryption failures bypassing `AppError`.
- Added `@kb/observability.createSafeErrorLogFields` for shared safe log payloads.

Red checks run before implementation:

```bash
pnpm --filter @kb/observability test
pnpm --filter @kb/api test -- src/http/error-handling.test.ts src/modules/providers/router.test.ts src/modules/auth/lib/better-auth-service.test.ts
pnpm --filter @kb/knowledge test -- src/operations/upload-document-file/tests/observability.test.ts
```

Expected failures were observed:

- `createSafeErrorLogFields` did not exist.
- API unknown errors logged the raw `Error.message`.
- Better Auth runtime failures logged raw secret-bearing messages.
- Invalid provider transport ciphertext returned `500 INTERNAL_ERROR`.
- Upload failure logs wrote raw object-key/token/requestBody text.

Green checks run after implementation:

```bash
pnpm --filter @kb/observability test
pnpm --filter @kb/api test -- src/http/error-handling.test.ts src/modules/providers/router.test.ts src/modules/auth/lib/better-auth-service.test.ts
pnpm --filter @kb/knowledge test -- src/operations/upload-document-file/tests/observability.test.ts
pnpm typecheck
pnpm lint
pnpm test
```

Results:

- `@kb/observability`: 1 test file, 4 tests passed.
- `@kb/api`: 22 test files, 109 tests passed.
- `@kb/knowledge`: 7 test files, 27 tests passed.
- `pnpm typecheck`: 19 packages successful.
- `pnpm lint`: 19 packages successful.
- `pnpm test`: 36 Turbo tasks successful.

## Second Code Review Fix Verification Run

Scope:

- Fixed RAG keyword-search failures escaping as raw `Error`.
- Added `AppError` wrapping for keyword-search failures with exact safe metadata:
  `knowledgeBaseId`, `requestId`, `retrievalRunId`, and `tenantId`.
- Marked the retrieval run as `failed` with safe failure code
  `keyword_search_failed` and safe user-facing failure message before rethrowing.

Red check run before implementation:

```bash
pnpm --filter @kb/rag test
```

Expected failure was observed:

- `submitQuestion` rejected with the raw message
  `keyword search failed token=secret_token` instead of an `AppError`.

Green checks run after implementation:

```bash
pnpm --filter @kb/rag test
pnpm --filter @kb/rag typecheck
pnpm --filter @kb/rag lint
pnpm typecheck
pnpm lint
pnpm test
pnpm build
git diff --check
```

Results:

- `@kb/rag`: 6 test files, 17 tests passed.
- `@kb/rag typecheck`: passed.
- `@kb/rag lint`: passed.
- `pnpm typecheck`: 19 packages successful.
- `pnpm lint`: 19 packages successful.
- `pnpm test`: 36 Turbo tasks successful.
- `pnpm build`: 19 packages successful.
- `git diff --check`: no whitespace errors.

Review-fix raw error-log scan:

```bash
rg -n "error instanceof Error \? error\.message|String\(error\)|stack: error\.stack" src/apps/api/src src/apps/worker/src src/packages/knowledge/src src/packages/ai-providers/src src/packages/rag/src src/packages/users/src src/packages/observability/src -g'*.ts'
```

Allowed hits:

| File:Line | Reason |
| --- | --- |
| `src/apps/api/src/app.ts:151` | `AppError` stack only; message comes from schema-validated `AppError.data.message`. |
| `src/apps/worker/src/task-errors.ts:21` | `AppError` stack only; non-`AppError` worker stacks are rewritten by `createSafeWorkerTaskStack`. |

Review-fix sensitive log scan:

```bash
rg -n "password|currentPassword|newPassword|confirmPassword|passwordHash|apiKey|providerApiKey|openaiApiKey|encryptedApiKey|decryptedApiKey|token|accessToken|refreshToken|idToken|bearerToken|csrfToken|sessionToken|verificationToken|resetToken|cookie|cookies|sessionCookie|Set-Cookie|setCookie|authorization|Authorization|proxyAuthorization|Proxy-Authorization|headers|requestHeaders|responseHeaders|body|requestBody|responseBody|rawBody|jsonBody|formData|multipartBody|providerRequestBody|providerResponseBody|providerPrompt|providerCompletion|prompt|completion|question|answer|messageContent|chatMessage|documentText|rawText|extractedText|pageText|markdown|plainText|chunkText|chunkContent|chunks|embedding|embeddings|vector|vectors|file|fileBuffer|buffer|bytes|arrayBuffer|blob|base64|DATABASE_URL|databaseUrl|connectionString|sql|rawSql|queryText|queryParams|REDIS_URL|redisUrl|S3_SECRET_ACCESS_KEY|AWS_SECRET_ACCESS_KEY|AWS_ACCESS_KEY_ID|awsSecretAccessKey|awsAccessKeyId|APP_ENCRYPTION_KEY|encryptionKey|privateKey|decryptedSecret|encryptedSecret" src/apps/api/src/app.ts src/apps/api/src/modules/auth/lib/better-auth-service.ts src/apps/api/src/guards/session/audit.ts src/apps/api/src/modules/documents/lib/upload-audit.ts src/packages/knowledge/src/operations/upload-document-file/observability/audit.ts src/apps/worker/src/task-errors.ts src/packages/observability/src/index.ts
```

Allowed hits:

| File:Line | Reason |
| --- | --- |
| `src/apps/api/src/app.ts:133` / `src/apps/api/src/app.ts:139` | `responseHeaders` to HTTP header conversion before log payload construction. |
| `src/apps/api/src/modules/auth/lib/better-auth-service.ts:66` / `src/apps/api/src/modules/auth/lib/better-auth-service.ts:68` / `src/apps/api/src/modules/auth/lib/better-auth-service.ts:123` / `src/apps/api/src/modules/auth/lib/better-auth-service.ts:152` | Better Auth runtime inputs only; catch log payloads use `createSafeErrorLogFields`. |
| `src/packages/observability/src/index.ts:39` to `src/packages/observability/src/index.ts:48` | Redaction key allowlist, not logged values. |
| `src/apps/api/src/modules/documents/lib/upload-audit.ts:19` | Audit reason enum literal; no file content or object key is logged. |

Sensitive fixture hits in `*.test.ts` are intentional regression inputs and are paired with `not.toContain(...)` assertions.

## Final Verification Run

Commands:

```bash
pnpm --filter @kb/errors test
pnpm --filter @kb/api test
pnpm --filter @kb/users test
pnpm --filter @kb/knowledge test
pnpm --filter @kb/ai-providers test
pnpm --filter @kb/rag test
pnpm --filter @kb/worker test
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Results:

- `@kb/errors`: 1 test file, 16 tests passed.
- `@kb/api`: 22 test files, 119 tests passed.
- `@kb/users`: 2 test files, 13 tests passed.
- `@kb/knowledge`: 7 test files, 27 tests passed.
- `@kb/ai-providers`: 5 test files, 20 tests passed.
- `@kb/rag`: 6 test files, 17 tests passed.
- `@kb/worker`: 1 test file, 10 tests passed.
- `pnpm typecheck`: 19 packages successful.
- `pnpm lint`: 19 packages successful.
- `pnpm test`: 36 Turbo tasks successful.
- `pnpm build`: 19 packages successful.

## Direct API Error Response Scan

Command:

```bash
rg -n "respondWithError|context\.json\(\s*createErrorResponse|createErrorResponse\(" src/apps/api/src src/packages
```

Allowed hits:

| File:Line | Match | Reason |
| --- | --- | --- |
| `src/apps/api/src/app.ts:155` | `createErrorResponse` | Global `AppError` to `ApiErrorResponse` mapper. |
| `src/apps/api/src/app.ts:177` | `createErrorResponse` | Global unknown-error fallback mapper. |
| `src/apps/api/src/http/responses.ts:22` | `createErrorResponse` | Response object factory used by the global mapper. |

Result: no `respondWithError` hits and no API guard/middleware/procedure direct
error response conversion hits.

## Old Error Pattern Scan

Command:

```bash
rg -n "respondWithServiceError|ApiServiceError|toServiceException|fromServiceException|serviceError" src/apps/api src/packages
```

Result: no matches.

## Final `ok: false` Scan Categories

Command:

```bash
rg -n "ok:\s*false|\{\s*ok:\s*false" src/apps/api src/packages src/apps/worker
```

Reviewed categories:

| Files | Reason |
| --- | --- |
| `src/packages/ai-providers/src/runtime/runtime-service.ts`, `src/packages/ai-providers/src/embedding/embedding-service.ts`, `src/packages/ai-providers/src/connection/connection-tester.ts`, and their tests | Provider runtime and connection degradation results. These are not API procedure service errors; provider-config interface errors now reject with `AppError`. |
| `src/packages/ingestion/src/**` and ingestion tests | Ingestion pipeline result contract explicitly remains unchanged by PRD R8 / Must Not Modify. |
| `src/packages/rag/src/service-types.ts`, `src/packages/rag/src/service.test.ts`, `src/apps/api/src/runtime/services.ts` | RAG provider degradation adapters; API-facing RAG validation and authorization errors throw `AppError`. |
| `src/apps/api/src/modules/documents/lib/upload-request.ts`, `src/apps/api/src/modules/documents/lib/file-validation.ts`, `src/apps/api/src/modules/documents/lib/upload-concurrency.ts`, `src/apps/api/src/modules/documents/procedures/upload-document-file.ts` | API-local upload parser, file-validation, content-length, and concurrency internals; procedure/middleware converts these to `AppError` before the HTTP boundary. |
| `src/apps/api/src/contracts/services.ts` | Internal rate limiter allow/deny contract; guards throw `rateLimited` on deny. |
| `src/apps/api/src/modules/auth/lib/better-auth-service.test.ts` | Test-only Better Auth runtime fixtures. |
| `src/packages/knowledge/src/operations/upload-document-file/access/authorization.ts` | Internal upload authorization preflight; caller immediately throws the contained `AppError`. |
| `src/packages/knowledge/src/operations/upload-document-file/lifecycle/failures.ts` | Internal object-cleanup result; not returned to API. |
| `src/packages/users/src/session-resolution.ts` | Internal auth session-resolution result; API auth service maps failures to `AppError`. |
| `src/packages/users/src/domain-errors.ts`, `src/packages/users/src/plans.ts`, and their tests | Browser-safe/domain planning helpers, not API service methods. |

Result: no remaining `ok: false` match is an API-facing business service error
returned to an API procedure.

## Latest Remaining `ok: false` Category Review

The latest scan output is allowed only in these files and for these contracts:

| Files | Allowed content |
| --- | --- |
| `src/packages/ai-providers/src/shared/service-types.ts`, `src/packages/ai-providers/src/runtime/runtime-service.ts`, `src/packages/ai-providers/src/embedding/embedding-service.ts`, `src/packages/ai-providers/src/connection/connection-tester.ts`, and their tests | Provider runtime, embedding, and connection degradation results. Provider-config API-facing errors reject with `AppError`. |
| `src/packages/ingestion/src/pipeline/embedding-batches.ts` and `src/packages/ingestion/src/tests/pipeline.test.ts` | Ingestion pipeline result contract explicitly remains unchanged by PRD R8 / Must Not Modify. |
| `src/packages/rag/src/service-types.ts`, `src/packages/rag/src/service.test.ts`, `src/apps/api/src/runtime/services.ts` | RAG provider degradation adapters only. Validation, authorization, and keyword-search failures throw `AppError`. |
| `src/apps/api/src/modules/documents/lib/upload-request.ts`, `src/apps/api/src/modules/documents/lib/file-validation.ts`, `src/apps/api/src/modules/documents/lib/upload-concurrency.ts`, `src/apps/api/src/modules/documents/procedures/upload-document-file.ts`, and upload tests | API-local parser, file-validation, content-length, and limiter internals. Procedure or middleware converts failure to `AppError` before the HTTP boundary. |
| `src/apps/api/src/contracts/services.ts` | Internal rate limiter allow/deny contract. Guards throw `rateLimited` on deny. |
| `src/apps/api/src/modules/auth/lib/better-auth-service.test.ts` | Test-only Better Auth runtime fixtures. |
| `src/packages/knowledge/src/operations/upload-document-file/access/authorization.ts` | Internal upload authorization preflight. Caller immediately throws the contained `AppError`. |
| `src/packages/knowledge/src/operations/upload-document-file/lifecycle/failures.ts` | Internal object-cleanup result. Failure is logged with safe ids and is not returned to API. |
| `src/packages/users/src/session-resolution.ts`, `src/packages/users/src/domain-errors.ts`, `src/packages/users/src/plans.ts`, and their tests | Internal auth/domain planning helpers. API auth service maps session-resolution failures to `AppError`. |

Result: no current `ok: false` match is an API-facing business service error
returned to an API procedure.

## Header And Metadata Scan Review

Command:

```bash
rg -n "Retry-After|Set-Cookie|responseHeaders|metadata" src/apps/api src/apps/worker src/packages/errors
```

Allowed hits:

| File:Line | Match | Reason |
| --- | --- | --- |
| `src/packages/errors/src/index.ts:97` | `responseHeaders` schema | Strict `AppErrorResponseHeaders` definition. |
| `src/packages/errors/src/index.ts:70` | `metadata` schema | Strict `AppErrorMetadata` field in `AppErrorData`. |
| `src/packages/errors/src/index.ts:154` | `retryAfterSeconds` | Validation forbids retry header unless code is `RATE_LIMITED`. |
| `src/packages/errors/src/index.ts:165` | `setCookie` | Validation forbids cookie headers unless domain is `auth`. |
| `src/apps/api/src/app.ts:133` | `responseHeaders.retryAfterSeconds` | Converted to HTTP `Retry-After`; not logged and not returned in JSON body. |
| `src/apps/api/src/app.ts:139` | `responseHeaders.setCookie` | Converted to HTTP `Set-Cookie`; not logged and not returned in JSON body. |
| `src/apps/api/src/app.ts:147` | `metadata` | Logs only schema-validated `AppErrorMetadata`. |
| `src/apps/api/src/app.ts:141` | error log payload | Logs only `code`, `httpStatus`, `domain`, `reason`, `retryable`, `metadata`, `error`, and `stack`. |
| `src/apps/worker/src/task-errors.ts:17` | `metadata` | Logs only schema-validated `AppErrorMetadata`. |
| `src/apps/worker/src/task-errors.ts:25` | non-AppError error log | Logs only `taskName`, `error`, and `stack`. |
| `src/apps/api/src/http/cookies.ts:10` | `Set-Cookie` | Response-header writer only; no logging. |
| `src/apps/api/src/modules/auth/lib/errors.ts:14` | `responseHeaders.setCookie` | Auth-domain cookie cleanup/refresh channel allowed by `@kb/errors` schema. |
| `src/apps/api/src/http/error-handling.test.ts:140` | `responseHeaders` | Test asserts response body excludes `responseHeaders`. |
| `src/apps/api/src/http/error-handling.test.ts:156` | `responseHeaders` | Test asserts logs exclude `responseHeaders`. |
| `src/apps/api/src/http/error-handling.test.ts:157` | `setCookie` | Test asserts logs exclude `setCookie`. |
| `src/apps/worker/src/lifecycle.test.ts:292` | `responseHeaders.setCookie` | Test input proves worker AppError logging excludes `responseHeaders` and `setCookie`. |
| `src/apps/worker/src/lifecycle.test.ts:321` | `responseHeaders` | Test assertion that worker logs exclude it. |

Audit metadata hits under `src/apps/api/src/runtime/services.ts`,
`src/apps/api/src/modules/documents/lib/upload-audit.ts`, and
`src/packages/knowledge/src/operations/upload-document-file/**` are audit-record
metadata, not `AppError.metadata` and not error-log payload fields. Their error
logs use safe IDs and messages only, for example
`src/packages/knowledge/src/operations/upload-document-file/observability/audit.ts:17`
logs `actorId`, `documentId`, `jobId`, `knowledgeBaseId`, `requestId`, and
`tenantId`.

## Forbidden Sensitive Field Scan Review

Command:

```bash
rg -n "password|currentPassword|newPassword|confirmPassword|passwordHash|apiKey|providerApiKey|openaiApiKey|encryptedApiKey|decryptedApiKey|token|accessToken|refreshToken|idToken|bearerToken|csrfToken|sessionToken|verificationToken|resetToken|cookie|cookies|sessionCookie|Set-Cookie|setCookie|authorization|Authorization|proxyAuthorization|Proxy-Authorization|requestHeaders|responseHeaders|requestBody|responseBody|rawBody|jsonBody|formData|multipartBody|providerRequestBody|providerResponseBody|providerPrompt|providerCompletion|prompt|completion|question|answer|messageContent|chatMessage|documentText|rawText|extractedText|pageText|markdown|plainText|chunkText|chunkContent|chunks|embedding|embeddings|vector|vectors|fileBuffer|arrayBuffer|blob|base64|objectKey|DATABASE_URL|databaseUrl|connectionString|rawSql|queryText|queryParams|REDIS_URL|redisUrl|S3_SECRET_ACCESS_KEY|AWS_SECRET_ACCESS_KEY|AWS_ACCESS_KEY_ID|awsSecretAccessKey|awsAccessKeyId|APP_ENCRYPTION_KEY|encryptionKey|privateKey|decryptedSecret|encryptedSecret" src/apps/api src/apps/worker src/packages/errors src/packages/users src/packages/knowledge src/packages/ai-providers src/packages/rag
```

The command intentionally scans all source and test files, so it matches normal
secret-processing code and test fixtures. The lines below are the reviewed
security-relevant matches.

| File:Line | Match | Reason |
| --- | --- | --- |
| `src/packages/errors/src/index.test.ts:81` | `apiKey` | Negative schema test: `metadata.apiKey` must be rejected. |
| `src/packages/errors/src/index.ts:100` | `setCookie` | Strict response-header schema field; only auth domain passes validation. |
| `src/packages/errors/src/index.ts:141` | `responseHeaders` | Strict schema field; not logged by API or worker. |
| `src/apps/api/src/app.ts:133` | `responseHeaders` | Header conversion before logging. |
| `src/apps/api/src/app.ts:139` | `setCookie` | Header conversion before logging. |
| `src/apps/api/src/app.ts:141` | error log payload | Does not include `responseHeaders`, `setCookie`, cookies, tokens, password fields, provider keys, prompts, document text, chunks, embeddings, vectors, DB URLs, Redis URLs, S3/AWS credentials, or encryption keys. |
| `src/apps/worker/src/task-errors.ts:9` | worker AppError log payload | Does not include `responseHeaders`; fields are exactly the R8 allowlist. |
| `src/apps/worker/src/lifecycle.test.ts:292` | `responseHeaders` | Test-only input proving worker log stripping. |
| `src/apps/worker/src/lifecycle.test.ts:293` | `setCookie` | Test-only input proving worker log stripping. |
| `src/apps/api/src/http/cookies.ts:10` | `Set-Cookie` | Response-header writer only; no log payload. |
| `src/apps/api/src/modules/auth/lib/errors.ts:14` | `setCookie` | Stored only in `AppError.responseHeaders`; global handler strips from JSON/logs. |
| `src/apps/api/src/modules/auth/lib/better-auth-service.ts:111` | auth login error log | Logs only normalized error message; request body password is never added to the log payload. |
| `src/apps/api/src/modules/auth/lib/better-auth-service.ts:133` | auth logout error log | Logs only normalized error message; cookie header is not added to the log payload. |
| `src/apps/api/src/modules/auth/lib/better-auth-service.ts:180` | auth session error log | Logs only normalized error message; cookie header is not added to the log payload. |
| `src/apps/api/src/guards/session/audit.ts:28` | audit failure error log | Logs only `error` and `requestId`. |
| `src/apps/api/src/modules/documents/lib/upload-audit.ts:33` | upload audit failure error log | Logs only `error`, hard-coded `reason`, and `requestId`. |
| `src/packages/knowledge/src/operations/upload-document-file/observability/audit.ts:17` | upload operation error log | Logs only safe ids plus normalized error message. |
| `src/apps/worker/src/index.ts:43` | `DATABASE_URL` | Environment config consumed to create DB runtime; not logged and not AppError metadata. |
| `src/apps/worker/src/index.ts:51` | `S3_SECRET_ACCESS_KEY` | Environment config consumed to create storage client; not logged and not AppError metadata. |
| `src/apps/worker/src/index.ts:61` | `REDIS_URL` | Environment config consumed to create BullMQ connection; not logged and not AppError metadata. |
| `src/apps/worker/src/index.ts:64` | `APP_ENCRYPTION_KEY` | Environment config normalized for provider secret decryption; not logged and not AppError metadata. |
| `src/apps/worker/src/index.ts:74` | `apiKey` | Meilisearch client configuration; not logged and not AppError metadata. |
| `src/packages/ai-providers/src/provider-config/provider-secrets.ts:47` | `apiKey` | Provider key processing variable; value is encrypted/masked and not logged. |
| `src/packages/ai-providers/src/provider-config/provider-secrets.ts:149` | `metadata.maskedKey` | Stores masked key metadata, not plaintext key. |
| `src/packages/users/src/operations/create-user.ts:100` | `password` | Password is passed to auth account upsert; not logged and not AppError metadata. |
| `src/packages/users/src/operations/update-user.ts:80` | `password` | Password reset value is passed to auth account upsert; not logged and not AppError metadata. |
| `src/apps/api/src/modules/providers/procedures/save-provider.ts:31` | `ciphertext` | Encrypted provider-key payload decrypted for provider config save; not logged and not AppError metadata. |
| `src/apps/api/src/modules/providers/procedures/save-provider.ts:43` | `apiKey` | Provider key handed to provider config service; not logged and not AppError metadata. |

Test files under `src/apps/api/**.test.ts`, `src/packages/**.test.ts`, and
`src/packages/rag/src/service.test-fixtures.ts` include passwords, cookies,
tokens, API-key-shaped strings, questions, answers, chunks, embeddings, and
vectors only as test fixtures or assertions. They are not production error logs
and are not `AppError.metadata`.
