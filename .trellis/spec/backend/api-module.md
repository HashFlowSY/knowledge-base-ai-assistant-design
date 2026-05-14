# Hono API Module Guidelines

These rules apply to API code in `src/apps/api` and to backend contract code owned by domain packages.

## Module Shape

Organize API modules by business domain.

Recommended shape:

```text
src/apps/api/modules/[domain]/
├── types.ts          # Zod schemas and exported API types
├── router.ts         # Hono route definitions for the domain
├── procedures/       # HTTP endpoint handlers
│   ├── create.ts
│   ├── update.ts
│   ├── list.ts
│   └── get.ts
└── lib/              # API-local helpers, mappers, and validators
```

If the domain logic is reusable by worker or other packages, place it in `src/packages/[domain]` and keep `src/apps/api/modules/[domain]` as a thin HTTP adapter.

## File Responsibilities

### `types.ts`

- Defines Zod schemas for endpoint inputs and outputs.
- Exports inferred TypeScript types.
- Owns list filter, pagination, and path/query/body input schemas.
- Does not contain business logic.

### `router.ts`

- Creates the domain Hono router.
- Mounts procedures.
- Applies domain-level middleware when needed.
- Keeps route mapping simple.

### `procedures/`

Each procedure should:

1. Read route, query, or body input.
2. Validate input with the domain schema.
3. Read authentication context from Hono context.
4. Enforce authorization.
5. Call the owning package/domain service.
6. Map domain results to the API response schema.
7. Log relevant success/failure metadata.

Avoid large procedures. If a procedure grows because of domain rules, move those rules into the owning package or module `lib/`.

## Hono Patterns

Use `app.route()` to group related routes.

```typescript
const api = new Hono<ApiEnv>();
api.route("/knowledge-bases", knowledgeBasesRouter);
api.route("/documents", documentsRouter);
api.route("/chat", chatRouter);
```

Use Hono context variables for request-scoped values such as:

- `requestId`
- `logger`
- `session`
- `actor`
- `tenantId`

Do not use Hono context as a replacement for domain service parameters. Pass explicit arguments into package functions.

## API Route Namespace

Internal JSON/API endpoints should live under an API namespace such as `/api`.

UI routes belong to the web app. API routes should not collide with web routes.

## Response and Error Shape

Success response shapes may be domain-specific, but list endpoints should expose explicit pagination metadata.

Errors must be mapped to the project API error contract:

```typescript
{
  code: "VALIDATION_ERROR",
  message: "Invalid input",
  requestId,
  validationErrors,
}
```

Do not leak stack traces, provider secrets, SQL details, or raw upstream error bodies to clients.

## Anti-Patterns

Avoid:

- Unvalidated `await c.req.json()` data flowing into services or database writes.
- Inline request/response types in procedure files.
- Repeating authorization checks in every procedure when a shared helper can express the rule.
- Putting ingestion, RAG, provider, or permission business logic directly in API handlers.
- Returning inconsistent error response formats from different modules.

