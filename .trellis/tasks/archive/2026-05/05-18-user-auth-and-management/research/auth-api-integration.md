# Auth/API Integration Research

## Question

How should this project connect the existing frontend user flows to real backend authentication and user-management APIs?

## Sources

- Better Auth Hono integration: https://better-auth.com/docs/integrations/hono
- Better Auth email/password: https://better-auth.com/docs/authentication/email-password
- Better Auth basic usage: https://better-auth.com/docs/basic-usage
- Better Auth Admin plugin: https://better-auth.com/docs/plugins/admin
- Better Auth Drizzle adapter: https://better-auth.com/docs/adapters/drizzle
- Hono RPC guide: https://hono.dev/docs/guides/rpc
- Project specs:
  - `.trellis/spec/backend/security.md`
  - `.trellis/spec/backend/api-contract.md`
  - `.trellis/spec/frontend/state-management.md`
  - `.trellis/spec/guides/cross-layer-thinking-guide.md`

## Findings

- The repo specs already choose Better Auth for authentication and Hono for the API runtime.
- Current code has Better Auth-compatible database tables, but `@kb/auth` is only a local actor/role schema. There is no Better Auth runtime instance yet.
- Current API app only exposes `/health`. No auth middleware, user routes, typed API client, or Hono RPC route group exists yet.
- Better Auth supports email/password auth and server-side `auth.api` calls. It also provides client-side sign-in/sign-out/session helpers.
- Better Auth's Hono integration expects a configured Better Auth instance and supports cookie-based sessions. Cross-origin Hono clients must send credentials.
- Better Auth's Drizzle adapter supports Postgres via `provider: "pg"` and can map custom schema/table names, which matters because this repo uses `auth_users`, `auth_sessions`, `auth_accounts`, and `auth_verifications`.
- Better Auth's Admin plugin provides user creation, listing, get-user, set-role, set-password, update-user, ban/unban, remove-user, and session-management operations. It adds `role`, `banned`, `banReason`, `banExpires` to the user table and `impersonatedBy` to the session table.
- The Admin plugin's default role names are `admin` and `user`; this project product role names are `admin` and `member`, so we either need to configure/customize Better Auth role semantics or wrap Better Auth admin calls behind project-owned APIs that translate `member` to the runtime role model.
- Hono RPC can share route types with the web app by exporting the Hono app/route type and using `hc<AppType>()`; cookie-backed calls need `credentials: "include"`.
- Frontend specs require production API-backed pages to stop importing `src/apps/web/src/features/mock/*` for migrated workflows and use feature-scoped TanStack Query hooks.

## Feasible Approaches

### Approach A: Better Auth runtime plus project-owned management API

Use Better Auth for email/password sessions, password hashing, session cookies, and Drizzle persistence. Add project-owned Hono routes for `/auth/me` and `/users` that normalize tenant role/status to the project's `admin/member` and `active/disabled` contract. User status uses `tenant_memberships.is_active`; role uses `tenant_memberships.role`.

Pros:
- Fits project specs: API owns authorization, frontend uses typed API hooks, server enforces admin-only operations.
- Keeps product role names stable.
- Avoids exposing Better Auth plugin details directly to frontend pages.
- Can keep admin self-protection and tenant scoping in project-owned code.

Cons:
- More implementation than simply calling Better Auth Admin plugin from the UI.
- Requires auth runtime, DB client, auth middleware, user domain logic, API routes, and frontend hooks in one task.

### Approach B: Better Auth Admin plugin as the user-management API

Use Better Auth admin client/server APIs directly for create/list/update/remove/set-role/set-password and use plugin `banned` as disabled status.

Pros:
- Fastest path to admin CRUD and password/session handling.
- Less custom user-management code.

Cons:
- Role model defaults to `admin/user`, while product uses `admin/member`.
- Admin plugin schema requires additional fields not currently in `auth_users`/`auth_sessions`.
- Direct frontend dependency on Better Auth admin semantics can make tenant membership and project audit rules harder to enforce consistently.

### Approach C: Custom minimal auth without Better Auth runtime

Implement email/password hashing, session cookie issuance, session storage, route guards, and user CRUD directly over existing `auth_*` and `tenant_memberships` tables.

Pros:
- Full control over project-specific role/status semantics.
- Could avoid Better Auth plugin schema mismatch.

Cons:
- Conflicts with project backend stack decision to use Better Auth.
- Higher security risk and more code for password/session/CSRF/cookie behavior.
- More likely to create maintenance debt.

## Recommendation

Choose Approach A: Better Auth runtime for core auth, wrapped by project-owned Hono APIs for user/session/permission semantics.

Implementation should keep the frontend unaware of mock state and Better Auth internals. The API should expose product-shaped responses with `role: "admin" | "member"` and `status: "active" | "disabled"`, enforce admin-only mutations server-side, and audit user-management changes.

## Open Implementation Decisions

- How to bootstrap the first admin and default tenant for local/dev environments.
- Whether to add Better Auth Admin plugin schema fields now, or avoid the plugin for user management and use only core Better Auth session/password APIs.
- Exact endpoint surface for login/logout/session, because Better Auth can own auth routes while project-owned APIs own `/auth/me` and `/users`.
