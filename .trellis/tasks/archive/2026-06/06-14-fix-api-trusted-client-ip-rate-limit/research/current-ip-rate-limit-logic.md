# Current IP Rate Limit Logic

## Scope

Research current API code paths affected by the `X-Forwarded-For` trust bug and
identify safe implementation options based on existing repository patterns.

## Current Implementation

- `src/apps/api/src/guards/session/request.ts` defines:
  - `getRequestIpSummary(context)`
  - It reads `context.req.header("x-forwarded-for")`.
  - It returns the first comma-separated value when present.
  - It falls back to `"127.0.0.1"` when absent.
- There is no current runtime config for trusted proxies.
- API startup in `src/apps/api/src/server.ts` calls `serve({ fetch: app.fetch,
  port })` from `@hono/node-server`.
- `@hono/node-server/conninfo` is available in the installed lockfile version
  and exposes `getConnInfo(context).remote.address` from the Node socket.

## Callers

### IP-scoped rate limiting

- `rateLimitLogin` hashes an identity created from email plus
  `getRequestIpSummary(context)`.
- `rateLimitAuthSession` falls back to IP identity when there is no valid
  session cookie.
- `rateLimitUnresolvedDocumentUpload`, `rateLimitUnresolvedUserManagement`, and
  `rateLimitUnresolvedKnowledgeBase` use IP identity for unauthenticated or
  unresolved requests.
- `consumeRateLimit` uses `context.get("rateLimitCounted")` to ensure one
  limiter key per request. This behavior should not change.

### Audit and metadata

- `respondWithForbiddenAdminAttempt` records forbidden admin attempts with
  `ipSummary`.
- `recordUploadSecurityFailure` records document upload security failures with
  `ipSummary`.
- Document upload service input includes `ipSummary`.
- Provider config save includes `ipSummary`.

## Bug

Because the current source is the client-controlled `X-Forwarded-For` header, an
attacker can rotate that header per request and evade IP-scoped unauthenticated
rate limits. The same spoofed value can also contaminate audit metadata.

The hard-coded fallback `127.0.0.1` is also a problem: when the header is absent
and a real remote address exists, unrelated clients collapse into the same IP
summary.

## Relevant Tests

Existing tests often set `x-forwarded-for`, but mostly assert that an identity
starts with `ip:` rather than asserting the exact IP hash. That leaves room to
change the source to server remote address and add targeted regression tests.

Examples:

- `src/apps/api/src/modules/auth/router.test.ts`
- `src/apps/api/src/guards/mutation.test.ts`
- `src/apps/api/src/modules/users/router.test.ts`
- `src/apps/api/src/modules/knowledge-bases/router.test.ts`

## Feasible Implementation Options

### A: Server remote address only

Use `@hono/node-server/conninfo` to derive `remote.address`. Ignore
`X-Forwarded-For` completely. Normalize stable address forms and use a clear
fallback only when no server remote address exists.

This is the safest MVP because it fails closed against spoofed headers.

### B: Trusted proxy configuration

Add runtime config and parsing for trusted proxy mode. Only use forwarded
headers when the immediate remote address is trusted.

This is more complete for production behind a reverse proxy, but requires
deployment-specific decisions and more config/test surface.

### C: Deployment-only fix

Require the edge layer to strip or overwrite forwarded headers. This is not
recommended as the only fix because the application would still trust the
header in environments where the edge rule is missing or misconfigured.

## Recommendation

Implement Approach A now, and leave Approach B as an explicit follow-up if
production needs original client IPs behind a known trusted proxy chain.

## Test Ideas

- Add unit tests for a pure resolver helper:
  - remote address wins over spoofed `X-Forwarded-For`.
  - IPv4-mapped IPv6 is normalized.
  - missing connection metadata uses a documented fallback.
- Add a route-level regression test around one unresolved limiter path:
  - same remote address plus different `X-Forwarded-For` values yields the same
    consumed identity.
  - different remote addresses yield different identities.

