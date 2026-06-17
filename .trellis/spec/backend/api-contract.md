# API Contract Guidelines

These rules define the HTTP and typed API contract for `src/apps/api` and `src/apps/web`.

## Runtime and Ownership

- `src/apps/api` runs Hono on Node.js.
- `src/apps/api` owns HTTP routing, middleware, request parsing, response mapping, Hono RPC, and OpenAPI output.
- Domain behavior belongs in `src/packages/*`; API procedures orchestrate domain package calls.
- `src/apps/web` calls internal APIs through the typed Hono RPC client when possible.
- External or long-term integration contracts are exposed through OpenAPI.

## Middleware Order

API middleware must run in this order unless a route documents an exception:

1. Request context: create or propagate `requestId`, attach request logger, set response header.
2. Security headers and CORS/CSRF controls.
3. Body size and content-type guards for routes that accept bodies.
4. Better Auth session resolution.
5. Tenant context resolution.
6. Route-level rate limiting for covered routes.
7. Route-level authorization.
8. Route handler.
9. Error mapper.

Request context must exist before any middleware that can log or throw.
Covered routes that reject before step 6, such as CSRF or content-type failures,
must still count the attempt with the route's unauthenticated identity. A request
must increment at most one limiter key; skip the later route-level limiter if an
earlier guard already counted the request.

## Hono Context Variables

Use typed Hono context variables for request-scoped values:

```typescript
type ApiContextVariables = {
  requestId: string;
  logger: RequestLogger;
  session: AuthSession | null;
  actor: AuthActor | null;
  tenantId: string | null;
};
```

Rules:

- `requestId` and `logger` are always present.
- `session`, `actor`, and `tenantId` are nullable on public routes.
- Protected route helpers must narrow nullable auth context before calling domain packages.
- Do not pass Hono context into `src/packages/*`; pass explicit values.

## Route Categories

| Category | Auth | Notes |
| --- | --- | --- |
| Health/config readiness | Public or internal | Must not expose secrets |
| Auth routes | Better Auth controlled | Rate limit aggressively |
| User and admin management | Admin | Audit all mutations |
| Knowledge base read/write | Authenticated | Filter by tenant and knowledge base permission |
| Ingestion upload/URL import | Authenticated | Validate file/URL before job creation |
| Chat/RAG | Authenticated | Enforce knowledge base authorization before retrieval |
| Provider config | Admin | Encrypt secrets and audit mutations |
| Audit logs | Admin | Never return secret-bearing metadata |

## Request Validation

Every endpoint must validate external input before domain calls.

Validate:

- Path params.
- Query params.
- JSON bodies.
- Multipart metadata.
- File type and size metadata.
- URL ingestion target.

Place schemas in the domain API module `types.ts` or in a shared contract package when used by multiple apps/packages.

## Scenario: Router-Level Query Validation

### 1. Scope / Trigger

- Trigger: an API route accepts user-controlled query params that can affect a
  service or database call.
- Applies to list/filter endpoints such as `GET /api/chat/sessions`.

### 2. Signatures

```typescript
export const listExampleQuerySchema = z.object({
  resourceId: z.string().trim().uuid().optional(),
});

export type ListExampleQuery = z.infer<typeof listExampleQuerySchema>;
```

### 3. Contracts

- Query schemas live in the domain API module `types.ts` unless shared across
  packages.
- Route definitions mount `createQueryValidationMiddleware("<key>", schema)`.
- Procedures read `getValidatedInput<ListExampleQuery>(context, "<key>")`.
- The Hono RPC status union must include `400` for routes that can reject query
  validation.

### 4. Validation & Error Matrix

- Missing optional query field -> accepted and represented as `undefined`.
- Empty query value for a required/UUID-shaped filter -> `400 VALIDATION_ERROR`.
- Malformed query value that would fail a database column type, such as a
  non-UUID id for a UUID column -> `400 VALIDATION_ERROR`.

### 5. Good/Base/Bad Cases

- Good: `?resourceId=<uuid>` reaches the service with the trimmed UUID.
- Base: no query string reaches the service with an empty/default query object.
- Bad: `?resourceId=` and `?resourceId=not-a-uuid` return validation envelopes
  before service/database access.

### 6. Tests Required

- Assert invalid empty and malformed query values return `400` with
  `code: "VALIDATION_ERROR"`.
- Assert invalid query values do not call the domain service.
- Assert omitted and valid query values still call the service with the expected
  typed query object.

### 7. Wrong vs Correct

#### Wrong

```typescript
export async function listProcedure(context: Context<ApiEnv>) {
  const query = listExampleQuerySchema.parse(
    Object.fromEntries(new URL(context.req.url).searchParams),
  );
  return service.list({ query });
}
```

#### Correct

```typescript
router.get(
  "/api/example",
  requireSession,
  createQueryValidationMiddleware("listExampleQuery", listExampleQuerySchema),
  (context) => listProcedure(context, dependencies),
);

export async function listProcedure(context: Context<ApiEnv>) {
  const query = getValidatedInput<ListExampleQuery>(context, "listExampleQuery");
  return service.list({ query });
}
```

## Scenario: Router-Level Path Param Validation

### 1. Scope / Trigger

- Trigger: an API route contains user-controlled path params that flow into a
  service or database call.
- Applies to resource identifiers such as `:knowledgeBaseId`, `:documentId`,
  `:sessionId`, and `:messageId` when the backing database column is UUID.

### 2. Signatures

```typescript
export const exampleResourceParamsSchema = z.object({
  resourceId: z.string().uuid(),
});

export type ExampleResourceParams = z.infer<
  typeof exampleResourceParamsSchema
>;
```

### 3. Contracts

- Path-param schemas live in the domain API module `types.ts` unless shared
  across packages.
- Route definitions mount `createParamValidationMiddleware("<key>", schema)`
  after auth/session middleware and before the procedure.
- Covered routes must not let path-param validation bypass route-level rate
  limits. If the authenticated actor limiter is part of the same route
  preflight, consume that limiter before returning a path-param validation
  error.
- Procedures read `getValidatedInput<ExampleResourceParams>(context, "<key>")`
  instead of calling `context.req.param("resourceId")` directly.
- The Hono RPC status union must include `400` for routes that can reject path
  param validation.
- Do not apply UUID validation to path params backed by non-UUID ids, such as
  Better Auth user ids stored as `text`.

### 4. Validation & Error Matrix

- Valid UUID path param -> request reaches the service with the validated id.
- Missing or empty path param -> `400 VALIDATION_ERROR`.
- Malformed path param for a UUID column -> `400 VALIDATION_ERROR` before any
  service or database call, after the route's expected limiter has been
  consumed for covered routes.
- Malformed path param on a rate-limited route whose limiter denies the request
  -> `429 RATE_LIMITED`.
- Text-backed ids, enum params, or provider kinds -> validate with their actual
  schema, not `z.string().uuid()`.

### 5. Good/Base/Bad Cases

- Good: `/api/example/<uuid>` calls the service with `<uuid>`.
- Base: `/api/users/user_2` remains valid when `userId` is text-backed.
- Bad: `/api/example/not-a-uuid` returns a validation envelope before service or
  database access.

### 6. Tests Required

- Assert malformed UUID path params return `400` with
  `code: "VALIDATION_ERROR"`.
- Assert malformed UUID path params do not call the domain service.
- Assert malformed UUID path params still consume the expected route-level
  limiter when the route is covered by one.
- Assert valid UUID path params still call the service with the expected typed
  id.
- Assert RPC status unions include `400` for routes with path-param validation.

### 7. Wrong vs Correct

#### Wrong

```typescript
export async function getExampleProcedure(context: Context<ApiEnv>) {
  return service.get({
    resourceId: context.req.param("resourceId"),
  });
}
```

#### Correct

```typescript
router.get(
  "/api/example/:resourceId",
  requireSession,
  createParamValidationMiddleware(
    "exampleResourceParams",
    exampleResourceParamsSchema,
  ),
  (context) => getExampleProcedure(context, dependencies),
);

export async function getExampleProcedure(context: Context<ApiEnv>) {
  const params = getValidatedInput<ExampleResourceParams>(
    context,
    "exampleResourceParams",
  );
  return service.get({ resourceId: params.resourceId });
}
```

## Response Rules

Business JSON APIs use a uniform response envelope. Domain-specific success data
goes in `data`; errors go through the standard error envelope. Health/readiness
routes may document a narrower response if they are intentionally not consumed by
the web app contract.

```typescript
type ApiSuccessResponse<T> = {
  success: true;
  httpStatus: number;
  data: T;
  requestId: string;
};

type ApiErrorResponse = {
  success: false;
  httpStatus: number;
  code: ApiErrorCode;
  message: string;
  requestId: string;
  validationErrors?: Array<{
    path: Array<string | number>;
    message: string;
  }>;
};

type EmptyPayload = null;
```

Rules:

- `httpStatus` in the response body must match the actual HTTP status code.
- Success responses do not include a business `code`; the status is represented by `httpStatus`.
- Error responses must include a standard public `code`.
- No-business-data success responses use `data: null`, not `{}` or a bare `{ success: true }`.
- Do not return bare domain payloads such as `SessionPayload`, `UserSummary`, or `PageResult<T>` from business JSON APIs.

List responses must include:

```typescript
type PageResult<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
};
```

Use cursor pagination for high-volume append-only streams such as logs when offset pagination is inefficient. Cursor contracts must define the exact cursor fields.

## Error Contract

All API errors returned to clients must use `ApiErrorResponse`.

The public error-code union is schema-owned by `@kb/shared`:

- `apiErrorCodeSchema`
- `ApiErrorCode`

API response helpers, `ApiErrorResponse.code`, and API-facing service errors
must use `ApiErrorCode` rather than a broad `string`. Internal package error
codes that are not public API codes must be mapped before returning an HTTP
response.

Standard codes:

- `VALIDATION_ERROR`
- `UNAUTHORIZED`
- `FORBIDDEN`
- `NOT_FOUND`
- `CONFLICT`
- `RATE_LIMITED`
- `PAYLOAD_TOO_LARGE`
- `UNSUPPORTED_MEDIA_TYPE`
- `PROVIDER_UNAVAILABLE`
- `INTERNAL_ERROR`

Do not return stack traces, SQL details, provider raw errors, plaintext secrets, prompt content, chunk content, or complete model output in error responses.

## Scenario: Ingestion Job Error Codes Are Not API Error Codes

### 1. Scope / Trigger

- Trigger: ingestion pipeline or worker code records failed document processing
  state, and API code later exposes that state through task/status endpoints.
- Applies to persisted job/source fields such as `lastErrorCode`,
  `lastErrorMessage`, `uploadErrorCode`, and document processing summaries.

### 2. Signatures

```typescript
type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;

type IngestionJobErrorCode = "INGESTION_FAILED" | string;
```

### 3. Contracts

- `INGESTION_FAILED` is an ingestion/job-state error code, not an
  `ApiErrorResponse.code`.
- Do not add `INGESTION_FAILED` to `apiErrorCodeSchema` unless an HTTP endpoint
  intentionally returns it in the standard API error envelope.
- Ingestion failures that happen after upload/enqueue must be persisted on the
  job/source record and returned as normal response `data` from status/list
  endpoints.
- Synchronous API request failures before enqueue must map to public API codes
  such as `VALIDATION_ERROR`, `PAYLOAD_TOO_LARGE`, `UNSUPPORTED_MEDIA_TYPE`,
  `FORBIDDEN`, `RATE_LIMITED`, `PROVIDER_UNAVAILABLE`, or `INTERNAL_ERROR`.

### 4. Validation & Error Matrix

| Condition | Required outcome |
| --- | --- |
| Upload request has invalid multipart/file input | Return `ApiErrorResponse` with `VALIDATION_ERROR`, `PAYLOAD_TOO_LARGE`, or `UNSUPPORTED_MEDIA_TYPE` |
| Authenticated actor lacks upload/read permission | Return `ApiErrorResponse` with `FORBIDDEN` or hidden `NOT_FOUND` |
| BullMQ enqueue fails synchronously before response | Return a public API error code, usually `INTERNAL_ERROR` or a documented domain mapping |
| Worker ingestion step fails after enqueue | Persist job/source error state, such as `INGESTION_FAILED`; do not throw an API-facing `AppError` |
| Status/list endpoint reads a failed job | Return success envelope data containing the processing/job status and safe error summary |

### 5. Good/Base/Bad Cases

- Good: worker records `lastErrorCode = "INGESTION_FAILED"`, and
  `/documents/processing` returns that value inside `data.items[].job`.
- Base: API upload parser rejects an unsupported file extension with
  `UNSUPPORTED_MEDIA_TYPE`.
- Bad: API procedure throws `AppError` with `code: "INGESTION_FAILED"` and the
  global HTTP mapper returns it as `ApiErrorResponse.code`.

### 6. Tests Required

- Shared schema tests should reject `INGESTION_FAILED` as a public
  `ApiErrorCode` unless the contract is deliberately changed.
- Ingestion/worker tests should assert failed pipeline steps persist normalized
  job/source error fields.
- API document-processing tests should assert failed job information is returned
  as success-envelope data, not as an API error envelope.

### 7. Wrong vs Correct

#### Wrong

```typescript
throw createAppError({
  code: "INGESTION_FAILED",
  httpStatus: 500,
  message: "Ingestion failed.",
  domain: "ingestion",
  reason: "ingestion_failed",
});
```

#### Correct

```typescript
await markIngestionJobFailed({
  errorCode: "INGESTION_FAILED",
  errorMessage: "文档处理失败，请重试。",
  ingestionJobId,
});
```

Provider package errors must be mapped before they reach clients:

| Provider code | API code | Notes |
| --- | --- | --- |
| `PROVIDER_AUTH_FAILED` | `FORBIDDEN` or `PROVIDER_UNAVAILABLE` | Use `FORBIDDEN` for admin config validation routes; use `PROVIDER_UNAVAILABLE` for end-user chat/retrieval paths |
| `PROVIDER_RATE_LIMITED` | `RATE_LIMITED` or `PROVIDER_UNAVAILABLE` | Use `RATE_LIMITED` when the caller can retry later directly |
| `PROVIDER_TIMEOUT` | `PROVIDER_UNAVAILABLE` | Include `requestId`, not provider raw body |
| `PROVIDER_UNAVAILABLE` | `PROVIDER_UNAVAILABLE` | Safe generic provider outage |
| `PROVIDER_INVALID_REQUEST` | `VALIDATION_ERROR` or `INTERNAL_ERROR` | User-controlled invalid input maps to validation; internal prompt/config bugs map to internal |
| `PROVIDER_UNSUPPORTED_MODEL` | `VALIDATION_ERROR` | For admin/provider configuration routes |
| `PROVIDER_CONTENT_REJECTED` | `VALIDATION_ERROR` | Message should be safe and user-actionable |
| `PROVIDER_UNKNOWN_ERROR` | `PROVIDER_UNAVAILABLE` | Default safe fallback |

Frontend copy should map from the public API code and optional safe detail, not
from raw provider errors.

Tests required:

- Shared schema tests reject non-standard public codes.
- API typecheck catches service errors with non-public `code` values.
- Web tests/typecheck update helpers that construct API errors to use `ApiErrorCode`.

## Scenario: Unified Backend Interface Errors

### 1. Scope / Trigger

- Trigger: backend code needs to reject an API-facing request from API
  middleware, API guards, or a domain package called by an API procedure.
- Scope: `src/packages/errors`, `src/apps/api`, API-facing service methods in
  `src/packages/*`, and scheduled/background error logging in `src/apps/worker`.
- Non-interface errors inside ingestion pipeline result contracts, provider
  runtime degradation, and internal planning/parse result objects may keep
  local result unions when they do not cross the API procedure boundary.

### 2. Signatures

```typescript
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

interface AppErrorResponseHeaders {
  retryAfterSeconds?: number;
  setCookie?: string[];
}
```

`@kb/errors` owns `AppError`, `appErrorDataSchema`, `isAppError`, and factory
functions such as `unauthorized`, `forbidden`, `validationError`,
`rateLimited`, and `internalError`.

### 3. Contracts

- API-facing expected errors are thrown as `AppError`; API procedures do not
  call `respondWithServiceError` or manually convert service errors.
- `src/apps/api/src/app.ts` is the only HTTP boundary that converts `AppError`
  into `ApiErrorResponse`.
- `responseHeaders.retryAfterSeconds` is converted to `Retry-After`.
- `responseHeaders.setCookie` is converted to one or more `Set-Cookie` headers.
- `responseHeaders` is never serialized into the JSON error body and is never
  logged.
- `AppErrorMetadata` is a strict whitelist. Allowed fields are safe system ids,
  hard-coded operation names, route path without query string, HTTP method,
  content length, max bytes, queue name, job id, and retry attempt.
- Do not add request bodies, raw headers, cookies, tokens, passwords, provider
  keys, provider prompts/responses, document text, chunk text, embeddings,
  vectors, object keys, database URLs, Redis URLs, AWS/S3 credentials, or
  encryption/private keys to `AppError.metadata` or error log payloads.

### 4. Validation & Error Matrix

| Condition | Required outcome |
| --- | --- |
| Zod body validation failure | Throw `validationError({ domain: "api", reason: "invalid_request_body" })` |
| Query validation failure | Throw `validationError({ domain: "api", reason: "invalid_query_params" })` |
| Path-param validation failure | Throw `validationError({ domain: "api", reason: "invalid_path_params" })` |
| Missing or expired session | Throw `unauthorized({ domain: "auth", reason: "missing_session" | "session_expired" })` |
| Rate limit rejection | Throw `rateLimited({ domain: "api", reason: "rate_limited", retryAfterSeconds })` |
| Domain not found/forbidden/conflict | Domain package throws `notFound`, `forbidden`, or `conflict` with its domain |
| Unknown API exception | Global handler returns `INTERNAL_ERROR/500` and logs safe request context |
| Scheduled worker AppError | Worker logs only code, status, domain, reason, retryable, metadata, error, stack |
| Scheduled worker non-AppError | Worker logs only taskName, error, stack |

### 5. Good/Base/Bad Cases

- Good: `@kb/users` throws `conflict({ domain: "users", reason: "duplicate_email" })`
  and the API procedure returns only the success branch.
- Base: an upload parser returns an internal `{ ok: false }` result; the API
  procedure immediately converts it to `validationError`, `payloadTooLarge`, or
  `unsupportedMediaType`.
- Bad: a business package returns `{ ok: false, error }` to an API procedure
  and the procedure calls `respondWithServiceError`.
- Bad: an AppError metadata object includes `apiKey`, `cookie`,
  `responseHeaders`, `question`, `chunkText`, or `vector`.

### 6. Tests Required

- `@kb/errors` tests must cover strict metadata schema, strict
  `responseHeaders` schema, code/status pairing, `retryAfterSeconds` limited to
  `RATE_LIMITED`, and `setCookie` limited to auth-domain errors.
- API error-handler tests must assert `AppError` response envelopes, unknown
  error fallback, `Retry-After`, `Set-Cookie`, and absence of `responseHeaders`
  and `setCookie` in logs/body.
- API guard/middleware tests must assert expected rejections become AppError
  responses and do not call domain services after validation failure.
- Domain package tests must assert API-facing expected errors reject with
  `isAppError(error) === true` or match `error.data`.
- Worker lifecycle tests must assert scheduled task failures are caught/logged
  and BullMQ retry behavior remains unchanged.
- Final quality checks must scan for `respondWithServiceError`,
  `ApiServiceError`, `toServiceException`, and `fromServiceException`.

### 7. Wrong vs Correct

#### Wrong

```typescript
const result = await userService.createUser(input);
if (!result.ok) {
  return respondWithServiceError(context, result.error);
}
```

#### Correct

```typescript
const result = await userService.createUser(input);
return context.json(createSuccessResponse({ data: result.user, httpStatus: 201, requestId }), 201);
```

## OpenAPI Rules

OpenAPI output must include:

- Tags per domain.
- Summary and operation id for every public route.
- Request schemas and response schemas.
- Auth requirements.
- Standard error responses.

OpenAPI must cover admin, ingestion, chat, provider config, health, and management APIs.

Internal-only implementation details such as queue payload schemas do not need to be public OpenAPI routes unless they are exposed over HTTP.

## Hono RPC Rules

The web app may use Hono RPC for internal type-safe calls.

Rules:

- Export API route types from a single API entrypoint.
- If routes are registered imperatively on a mutable `Hono` app, preserve a
  literal RPC route schema type explicitly. Returning a widened `Hono<ApiEnv>`
  or deriving `typeof app` after mutating `const app = new Hono(); app.get(...)`
  can erase the route schema and make `hc<ApiApp>()` degrade to `unknown`.
- Frontend query hooks import or infer types from that API entrypoint.
- Do not redefine API response types in frontend modules.
- Use the same input schemas for Hono RPC and OpenAPI-exposed endpoints.

Wrong:

```typescript
export function createApiApp(): Hono<ApiEnv> {
  const app = new Hono<ApiEnv>();
  app.get("/api/auth/session", sessionHandler);
  return app;
}

export type ApiApp = ReturnType<typeof createApiApp>; // route schema erased
```

Correct:

```typescript
type ApiRouteSchema = {
  "/api/auth/session": {
    $get: JsonEndpoint<Record<string, never>, ApiSuccessResponse<SessionPayload>, 200>;
  };
};

export type ApiApp = HonoBase<ApiEnv, ApiRouteSchema, "/">;
```

## Scenario: Multipart Upload Hono RPC Contract

### 1. Scope / Trigger

- Trigger: web clients uploading files through the internal Hono RPC client.
- This is cross-layer because `src/apps/api` owns the RPC route schema while
  `src/apps/web` depends on the generated `hc<ApiApp>()` client shape.

### 2. Signatures

```typescript
type ApiRouteSchema = {
  "/api/knowledge-bases/:knowledgeBaseId/documents/upload": {
    $post: JsonEndpoint<
      {
        form: {
          file: File;
          title?: string;
        };
        param: { knowledgeBaseId: string };
      },
      ApiSuccessResponse<DocumentFileUploadResult> | ApiErrorResponse,
      200 | 201 | 400 | 401 | 403 | 404 | 409 | 413 | 415 | 429 | 500
    >;
  };
};
```

### 3. Contracts

- Request path: `/api/knowledge-bases/:knowledgeBaseId/documents/upload`.
- Request body: `multipart/form-data` generated by the Hono RPC client from a
  plain `form` object.
- Required form field: `file: File`.
- Optional form field: `title?: string`.
- Response data: `DocumentFileUploadResult` in the standard success envelope.
- Duplicate uploads return `200` with `data.duplicate: true`; new uploads
  return `201` with `data.duplicate: false`.

### 4. Validation & Error Matrix

- Missing/invalid file or title -> `VALIDATION_ERROR`.
- Unsupported extension or MIME type -> `UNSUPPORTED_MEDIA_TYPE`.
- Oversized request or file -> `PAYLOAD_TOO_LARGE`.
- Missing/expired session -> `UNAUTHORIZED`.
- Actor lacks knowledge-base permission -> `FORBIDDEN`.
- Missing knowledge base -> `NOT_FOUND`.
- Upload concurrency or rate limit exceeded -> `RATE_LIMITED`.

### 5. Good/Base/Bad Cases

- Good: `form: { file, title: "Policy" }` uploads a single supported file and
  stores the explicit title.
- Base: `form: { file }` uploads a supported file and lets the backend derive
  the title from the filename.
- Bad: `form: formData` in the RPC schema or client call. Hono's RPC client
  builds multipart bodies from object entries; a `FormData` instance does not
  preserve the intended typed fields at the contract boundary.

### 6. Tests Required

- API contract or frontend hook test asserts the typed RPC path exposes
  `apiClient.api["knowledge-bases"][":knowledgeBaseId"].documents.upload.$post`.
- Frontend upload hook test/static contract asserts `documentFileUploadResultSchema`
  is used to parse the response.
- API tests cover new upload, duplicate upload, invalid multipart, unsupported
  file type, oversized upload, auth, permission, and rate-limit failures.

### 7. Wrong vs Correct

#### Wrong

```typescript
type UploadRoute = {
  $post: JsonEndpoint<
    { form: FormData; param: { knowledgeBaseId: string } },
    ApiSuccessResponse<DocumentFileUploadResult> | ApiErrorResponse,
    201
  >;
};
```

#### Correct

```typescript
type UploadRoute = {
  $post: JsonEndpoint<
    {
      form: { file: File; title?: string };
      param: { knowledgeBaseId: string };
    },
    ApiSuccessResponse<DocumentFileUploadResult> | ApiErrorResponse,
    200 | 201
  >;
};
```

## Scenario: Document Processing Progress And Retry RPC Contract

### 1. Scope / Trigger

- Trigger: web clients need to render document ingestion progress with sliding
  pagination inside knowledge-base detail views and manually retry eligible
  failed jobs.
- Scope: `src/packages/knowledge` browser-safe contracts, package service
  queries, `src/apps/api` RPC route schema/procedure, and `src/apps/web`
  knowledge hooks/components.

### 2. Signatures

- Detail API: `GET /api/knowledge-bases/:knowledgeBaseId` returns
  `KnowledgeBaseDetail` without embedded document processing rows.
- Processing list API:
  `GET /api/knowledge-bases/:knowledgeBaseId/documents/processing?page=&pageSize=`
  returns `ApiSuccessResponse<PageResult<DocumentProcessingSummary>>`.
- Retry API:
  `POST /api/knowledge-bases/:knowledgeBaseId/documents/:documentId/retry`
  with JSON body `{}`.
- Retry response: `ApiSuccessResponse<RetryDocumentProcessingResult>` or the
  standard `ApiErrorResponse`:
  ```typescript
  type RetryDocumentProcessingResult = {
    document: DocumentProcessingSummary;
    queued: boolean;
  };
  ```

### 3. Contracts

- `DocumentProcessingSummary.job.attempts` and `maxAttempts` are the persisted
  `ingestion_jobs` values; retry APIs must not increment attempts directly.
- `DocumentProcessingSummary.job.canRetry` is true only when the latest job is
  `failed`, `attempts < maxAttempts`, the matched source is a file source with
  `uploadStatus = "available"` and a non-null `objectKey`, and the source
  object cleanup status is `not_required`.
- When a latest job exists, processing summary queries must match its source by
  exact `(documentId, sourceHash)` only. Missing exact source data is an
  environment/data consistency error and should fail rather than falling back to
  another source row.
- Progress fields are counts, not percentages:
  `progress.chunkCount` and `progress.embeddedCount` may be `null` when the
  count is not known yet.
- Running embedding progress should prefer `ingestion_job_logs.metadata`
  (`chunkCount`, `embeddedCount`) because chunks and embeddings may be
  persisted together after embedding completes.
- Retry payloads are derived server-side from tenant, knowledge base, document,
  source, and persisted ingestion job state. Clients must not provide queue
  payloads or BullMQ job ids.
- `RetryDocumentProcessingResult.queued` is true only when the retry request
  actually moved the persisted job into a worker-claimable retry state and the
  producer path completed. No-op states such as completed, active, exhausted, or
  unsupported sources return `queued: false` with the current summary.
- If the retry producer is missing, treat it as an environment abnormality:
  return the current summary with `queued: false`, do not mark the persisted job
  `queued`, and do not consume a retry attempt.
- Web retry success copy must branch on `queued`: show "requeued" only when
  `queued === true`; otherwise show neutral current-state copy.
- Web document-processing list queries should use the shared infinite-query /
  scroll-area pattern, refetch while any loaded document has an active processing
  state (`pending`, `processing`, `pending_source`, `queued`, `running`, or
  `retrying`), and stop polling once loaded documents are terminal.

### 4. Validation & Error Matrix

- Missing/expired session -> `UNAUTHORIZED`.
- Actor lacks knowledge-base permission or crosses tenant/knowledge-base scope
  -> `FORBIDDEN` or safe `NOT_FOUND` per existing knowledge-base behavior.
- Bad origin, `Sec-Fetch-Site`, or non-JSON content type on retry ->
  `FORBIDDEN` or `UNSUPPORTED_MEDIA_TYPE` before service execution.
- Unauthenticated retry attempts are rate-limited by IP; authenticated attempts
  are rate-limited by tenant and actor.
- Failed job with exhausted attempts -> return current document summary with
  `canRetry: false` and `queued: false`; do not enqueue.
- Active `queued`, `running`, or `retrying` job -> return current summary; do
  not enqueue a duplicate; return `queued: false`.
- Queue enqueue failure after marking retry queued -> persist
  `QUEUE_ENQUEUE_FAILED`/retryable state so recovery can requeue; return
  `queued: false` for the immediate response.
- Missing retry producer -> return current summary with `queued: false`; do not
  mark the persisted job queued.

### 5. Good/Base/Bad Cases

- Good: a failed file ingestion job with `attempts: 2`, `maxAttempts: 3`, and
  source cleanup `not_required` is atomically moved back to `queued` and then
  enqueued with a server-derived file ingestion payload.
- Base: a repeated retry call after the first request has already queued the
  job returns the current `queued` summary with `queued: false` without
  consuming another attempt.
- Bad: a retry route accepts `{ jobId, sourceObjectKey }` from the browser and
  passes those fields into BullMQ.
- Bad: frontend shows "requeued" toast for every HTTP 200 retry response even
  when `queued: false`.

### 6. Tests Required

- Knowledge contract tests reject embedded `KnowledgeBaseDetail.documents` and
  parse `DocumentProcessingPage` independently.
- Knowledge contract tests parse `RetryDocumentProcessingResult` with a
  `document` summary and explicit `queued` flag.
- Knowledge mapper tests assert `canRetry` is false for URL sources, failed
  uploads, missing source object keys, cleanup-pending sources, and exhausted
  attempts.
- API tests cover processing list actor/path/query delegation, retry
  CSRF/content-type guard, unauthenticated IP rate limit, retry actor/path
  delegation, `queued` response data, and service error mapping.
- Frontend hook tests assert the typed RPC processing-list and retry paths exist,
  the retry mutation hook parses `retryDocumentProcessingResultSchema`, and
  active processing states enable document-processing list polling.
- Workspace contract tests assert the selected knowledge-base detail renders
  document progress counts, not percentages, and exposes retry controls.
- Frontend display tests assert completed jobs do not reuse active-processing
  disabled copy.
- Ingestion pipeline tests assert multi-batch embedding records
  `embedding.progress` metadata with completed chunk counts.

### 7. Wrong vs Correct

#### Wrong

```typescript
await retryQueue.enqueue({
  jobId: body.jobId,
  sourceObjectKey: body.sourceObjectKey,
});
```

#### Correct

```typescript
const result = await documentService.retryDocumentProcessing({
  actor,
  knowledgeBaseId: params.knowledgeBaseId,
  documentId: params.documentId,
});
```

## Streaming Chat

Streaming chat endpoints must:

- Authenticate before opening a stream.
- Validate selected knowledge base ids before retrieval.
- Emit recoverable stream events with request id and message id when possible.
- Persist assistant message, retrieval run, retrieval results, and citations even when stream delivery fails after generation succeeds.
- Avoid logging prompt, chunk, or full answer content by default.
