# Auth/User Management Cross-Layer Flow Note

## Current Contract

- `src/apps/web/src/features/auth/login-page.tsx` authenticates against `features/mock` users and writes mock session state.
- `src/apps/web/src/features/shell/app-shell.tsx` gates routes and navigation with mock session role, including a visible role switcher.
- `src/apps/web/src/features/admin/admin-list-page.tsx` renders `/users` from mock users and still exposes status enable/disable controls.
- `src/apps/api/src/app.ts` only exposes `/health`; no `/api/auth/*` or `/api/users*` routes exist yet.
- `src/packages/users/src/index.ts` still exports the old `{ userId, tenantId, email, name, role }` summary shape.

## Target Flow

```text
browser form / shell gate / users page
  -> web feature API hooks using same-origin /api
  -> Hono API routes with requestId + envelope
  -> auth/session/user service interfaces
  -> Better Auth compatible runtime and default tenant membership domain logic
```

## First Implementation Slice

- Lock shared response and user schemas with unit tests.
- Add Hono routes using injectable auth/user services so route contract tests do not require Postgres, Redis, or Better Auth internals.
- Keep route paths fixed under `/api`.
- Return uniform `ApiSuccessResponse<T>` and `ApiErrorResponse` envelopes with matching HTTP status and `requestId`.
- Move frontend auth/session/user management to feature-scoped TanStack Query hooks against same-origin `/api`, then remove mock auth/users authority from migrated production paths.

