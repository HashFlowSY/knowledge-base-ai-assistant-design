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
- `src/packages/errors`
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
- `errors`

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
- `errors`
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
- `errors`

Foundation packages must not depend on domain or infrastructure packages.
`@kb/errors` is a foundation package for API-facing backend error contracts and
may depend on `@kb/shared`; `@kb/shared` must not depend on `@kb/errors`.

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

### Package Internal Organization

For domain packages that expose both browser-safe contracts and server-only
services, keep the package root small:

```text
src/packages/<domain>/src/
├── index.ts          # browser-safe public contracts
├── service.ts        # server-only service entry
├── contracts/        # schemas, public inferred types, contract tests
├── service/          # server-only errors, queries, mappers, helpers, types
├── operations/       # feature-scoped service operations
└── ingestion/        # queue payload builders or ingestion adapters
```

Rules:

- Root files should be entry points only. Move implementation files into a
  functional directory.
- Keep browser-safe schemas and inferred types under `contracts/`; do not import
  `service/` files from the browser-safe root unless they are type-only and
  browser-safe.
- Put database-backed queries, service errors, mappers, and helper functions
  under `service/`.
- Put operation handlers under `operations/<feature>/` rather than keeping many
  standalone operation files directly under `operations/`.
- Put queue payload builders and ingestion-specific adapters under
  `ingestion/` when they are owned by the domain package.

### Server-Only Permission Subpaths

Domain-owned permission helpers that query domain tables must be exported from
an explicit server-only subpath, not from the browser-safe package root.

Current contract:

- `@kb/knowledge` is browser-safe and may export schemas and `KnowledgeActor`
  types.
- `@kb/knowledge/service` owns the database-backed knowledge service.
- `@kb/knowledge/permissions` owns reusable database-backed KB visibility
  primitives, including:
  - `createVisibleKnowledgeBaseConditions(actor)`
  - `actorCanAccessKnowledgeBase(db, { actor, knowledgeBaseId })`
- `@kb/rag` may depend on `@kb/knowledge/permissions` for KB authorization, but
  must not duplicate `knowledge_base_members` SQL.

Rules:

- Mirror every server-only package subpath in `package.json` `exports` and
  `tsconfig.base.json` `paths`.
- Keep database imports out of browser-safe roots such as
  `src/packages/knowledge/src/index.ts`.
- If a permission helper needs `ProjectDb` or Drizzle SQL, it belongs under the
  domain owner server-only surface, not `@kb/security`.
- Chat read/write paths that hide historical resource existence should convert
  failed current-KB visibility checks to the domain `NOT_FOUND` response.

## Scenario: Browser-Safe Package Entry Points

### 1. Scope / Trigger

- Trigger: a package is consumed by both `src/apps/web` browser/client code and server-only API or worker code.
- Common examples: frontend imports API schemas or inferred types from a domain package while `src/apps/api` imports that package's database-backed service.

### 2. Signatures

- Browser-safe root entry:
  ```json
  {
    "exports": {
      ".": "./src/index.ts"
    }
  }
  ```
- Server-only subpath entry:
  ```json
  {
    "exports": {
      ".": "./src/index.ts",
      "./service": "./src/service.ts"
    }
  }
  ```
- TypeScript path aliases must mirror the exported subpaths:
  ```json
  {
    "paths": {
      "@kb/users": ["src/packages/users/src/index.ts"],
      "@kb/users/service": ["src/packages/users/src/service.ts"]
    }
  }
  ```

### 3. Contracts

- Package root entries that may be imported by `src/apps/web` client components must export only browser-safe contracts: Zod schemas, inferred types, constants, and pure decision helpers.
- Database-backed services, Node runtime adapters, queue clients, Redis clients, filesystem access, and packages that pull in Node built-ins must live behind explicit server-only subpaths such as `@kb/users/service`.
- `src/apps/api` and `src/apps/worker` may import server-only subpaths. `src/apps/web` production code must not import those subpaths.
- Do not re-export server-only files from a browser-consumable root entry.

### 4. Validation & Error Matrix

| Condition | Required outcome |
| --- | --- |
| Frontend client component imports `@kb/users` schemas/types | Next build succeeds without bundling `pg`, `fs`, `net`, `tls`, or `dns` |
| Frontend production code imports `@kb/users/service` | Reject in review or lint/static check |
| API imports `@kb/users/service` | Allowed; service may depend on `@kb/db`, Drizzle, Redis, or Node-only packages |
| Package root re-exports `./service` | Invalid for packages consumed by browser/client code |

### 5. Good/Base/Bad Cases

- Good: `src/apps/web` imports `listUsersQuerySchema` and `UserSummary` from `@kb/users`; `src/apps/api` imports `createUserManagementService` from `@kb/users/service`.
- Base: a purely backend package that is never imported by `src/apps/web` may keep service exports at the root if package ownership remains clear.
- Bad: `export * from "./service"` in a package root that frontend hooks import for schemas; this can pull Node-only transitive dependencies into the browser bundle.

### 6. Tests Required

- Run `pnpm --filter @kb/web build` after changing exports for packages imported by web client components.
- Add or keep static checks where practical that search `src/apps/web/src` for server-only subpath imports.
- Run package and API type-checks after adding an exported subpath so path aliases, package exports, and imports stay aligned.

### 7. Wrong vs Correct

#### Wrong

```typescript
// src/packages/users/src/index.ts
export * from "./service";
export const userSummarySchema = z.object({ /* ... */ });
```

```typescript
// src/apps/web/src/features/admin/user-hooks.ts
import { userSummarySchema } from "@kb/users";
```

#### Correct

```typescript
// src/packages/users/src/index.ts
export const userSummarySchema = z.object({ /* ... */ });
export type UserSummary = z.infer<typeof userSummarySchema>;
```

```typescript
// src/apps/api/src/runtime-services.ts
import { createUserManagementService } from "@kb/users/service";
```

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
