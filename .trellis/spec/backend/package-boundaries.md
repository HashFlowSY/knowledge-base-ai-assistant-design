# Backend Package Boundary Guidelines

These rules define ownership and dependency direction for `src/apps/*` and `src/packages/*`.

## Top-Level Structure

Applications:

- `src/apps/web`: Next.js UI.
- `src/apps/api`: Hono API and OpenAPI output.
- `src/apps/worker`: BullMQ ingestion worker.

Packages:

- `src/packages/db`
- `src/packages/auth`
- `src/packages/users`
- `src/packages/knowledge`
- `src/packages/ingestion`
- `src/packages/rag`
- `src/packages/ai-providers`
- `src/packages/search`
- `src/packages/storage`
- `src/packages/queue`
- `src/packages/audit`
- `src/packages/security`
- `src/packages/observability`
- `src/packages/config`
- `src/packages/shared`

## Dependency Layers

Use this dependency direction:

```text
apps
  -> domain packages
      -> infrastructure packages
          -> foundation packages
```

Foundation packages:

- `shared`
- `config`
- `observability`

Infrastructure packages:

- `db`
- `storage`
- `search`
- `queue`
- `security`

Domain packages:

- `auth`
- `users`
- `knowledge`
- `ingestion`
- `rag`
- `ai-providers`
- `audit`

## Allowed Dependencies

Apps may depend on any package.

Domain packages may depend on:

- `shared`
- `config`
- `observability`
- `db`
- `storage`
- `search`
- `queue`
- `security`
- Explicitly allowed adjacent domain packages

Infrastructure packages may depend on:

- `shared`
- `config`
- `observability`

Foundation packages must not depend on domain or infrastructure packages.

## Adjacent Domain Dependencies

Allowed adjacent dependencies:

- `ingestion` may depend on `knowledge`, `ai-providers`, `search`, `storage`, `queue`, `audit`.
- `rag` may depend on `knowledge`, `ai-providers`, `search`, `audit`.
- `users` may depend on `auth` only for normalized auth identity types when needed.
- `knowledge` may depend on `audit` only through an interface or event function when practical.
- `ai-providers` must not depend on `rag` or `ingestion`.
- `audit` must not depend on domain packages; it accepts generic actor/action/target metadata.

If a new dependency would create a cycle, extract shared types or behavior into `shared`, `security`, or a narrower package.

## Security Package Boundary

`src/packages/security` owns generic security primitives and policy helpers that
do not require domain data ownership:

- token hashing and digest comparison helpers.
- encryption/decryption helper wrappers.
- SSRF URL and IP classification helpers.
- CSRF/rate-limit utility types when they are not framework-specific.
- generic redaction classification helpers.

`src/packages/security` must not own knowledge-base membership, tenant-specific
permission queries, or admin/user business rules. Those rules belong to
`knowledge`, `auth`, `users`, or API authorization helpers and may call generic
security helpers when needed.

If a permission helper must query domain tables, it is not a foundation security
primitive and should live with the domain owner.

## App Responsibilities

`src/apps/api` owns:

- HTTP routes.
- Middleware.
- Auth context extraction.
- Request validation and error mapping.
- Calling package APIs.
- OpenAPI output.

`src/apps/worker` owns:

- Worker process lifecycle.
- BullMQ processors.
- Job concurrency configuration.
- Mapping job payloads to package calls.
- Worker shutdown handling.

`src/apps/web` owns:

- UI routes.
- Server and client components.
- API hooks.
- URL state.
- Presentation and interaction.

Apps must not contain core business logic.

## Package API Design

Packages should expose narrow public APIs from an index file.

Example:

```text
src/packages/knowledge/
├── index.ts
├── types.ts
├── permissions.ts
├── knowledge-bases.ts
└── documents.ts
```

Rules:

- Export types and functions that consumers need.
- Keep internal helpers unexported.
- Avoid importing from another package's internal file path.
- Prefer explicit input objects for package functions.
- Include `tenantId` and `actorId` in package function inputs when authorization or audit decisions depend on them.

## Database Access

Database schema and low-level client setup belong to `src/packages/db`.

Domain packages may use database query helpers, but they should not duplicate table-specific query patterns in multiple packages. If the same query is needed in two packages, move it to the owning package or `db` query helper.

## Events and Side Effects

Cross-domain side effects should be explicit.

Examples:

- Knowledge package creates a document and calls audit package to record `document.created`.
- Ingestion package writes chunks and asks search package to index them.
- RAG package records retrieval run and feedback through audit or its own persistence boundary.

Do not hide important side effects in generic utility functions.

## Enforcement

The project should use lint/import rules to prevent:

- Circular dependencies.
- Apps importing package internals.
- Foundation packages importing domain packages.
- `api` or `worker` owning domain logic.
