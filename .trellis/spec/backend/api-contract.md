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
- `INGESTION_FAILED`
- `INTERNAL_ERROR`

Do not return stack traces, SQL details, provider raw errors, plaintext secrets, prompt content, chunk content, or complete model output in error responses.

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

## Streaming Chat

Streaming chat endpoints must:

- Authenticate before opening a stream.
- Validate selected knowledge base ids before retrieval.
- Emit recoverable stream events with request id and message id when possible.
- Persist assistant message, retrieval run, retrieval results, and citations even when stream delivery fails after generation succeeds.
- Avoid logging prompt, chunk, or full answer content by default.
