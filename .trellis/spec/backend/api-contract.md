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
  code: string;
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

## Streaming Chat

Streaming chat endpoints must:

- Authenticate before opening a stream.
- Validate selected knowledge base ids before retrieval.
- Emit recoverable stream events with request id and message id when possible.
- Persist assistant message, retrieval run, retrieval results, and citations even when stream delivery fails after generation succeeds.
- Avoid logging prompt, chunk, or full answer content by default.
