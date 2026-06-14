# fix(api): handle malformed session cookie in rate-limit identity

## Goal

Malformed session cookies must never throw during rate-limit identity generation. Auth/session-related routes should continue to return the existing API error envelope instead of leaking unexpected exceptions into the global 500 handler.

## What I Already Know

- The reported bug is in the auth-session rate-limit path.
- `createSessionRateLimitIdentity` derives a limiter key from the Better Auth session cookie when present, otherwise from IP summary.
- `getSessionCookieValue` currently decodes the cookie value and can throw for malformed percent-encoding.
- The initial code review identified `Cookie: better-auth.session_token=%` as a likely reproduction input.
- The user asked to create a Trellis task and produce a repair plan before implementation.

## Assumptions

- A malformed cookie should be treated as absent or invalid, not as an internal server error.
- The fix should preserve existing behavior for valid session cookies.
- The fix should avoid logging raw cookie values or tokens.

## Open Questions

- None currently blocking; inspect the current implementation before deciding exact patch location.

## Requirements

- Safely handle malformed session-cookie values in rate-limit identity generation.
- Keep the auth/session route response shape consistent with API error-contract conventions.
- Preserve valid cookie parsing behavior.
- Add focused regression coverage for malformed session cookies in the affected path.

## Acceptance Criteria

- [x] A malformed Better Auth session cookie no longer throws from rate-limit identity generation.
- [x] `/api/auth/session` with malformed cookie returns a controlled API error response, not `INTERNAL_ERROR`.
- [x] Valid session cookies still produce session-scoped rate-limit identities.
- [x] Missing/empty session cookies still fall back to IP-scoped identities.
- [x] Tests cover malformed, valid, and missing cookie behavior at the appropriate level.

## Definition of Done

- Tests added or updated for the regression.
- Relevant lint/type-check/test commands run, or any blocked command is recorded.
- No raw session cookie values are logged.
- No unrelated refactors or behavior changes.

## Out of Scope

- Reworking the full rate-limit strategy.
- Changing Better Auth session token format.
- Changing CSRF/origin checks.
- Changing IP trust behavior for `X-Forwarded-For`.

## Technical Notes

- Task created at `.trellis/tasks/06-14-fix-malformed-session-cookie-rate-limit`.
- Relevant specs to inspect: backend API contract, backend security, backend API module organization, shared TypeScript/code-quality rules.

## Current Implementation Analysis

### Request path

- `src/apps/api/src/modules/auth/router.ts` mounts `authSessionRateLimit` before `/api/auth/session` reaches `sessionProcedure`.
- `src/apps/api/src/middleware/rate-limit.ts` calls `rateLimitAuthSession`.
- `src/apps/api/src/guards/session/rate-limits.ts` builds the auth-session rate-limit identity before calling `consumeRateLimit`.
- `src/apps/api/src/rate-limit/identities.ts` calls `getSessionCookieValue(cookieHeader)` and uses the decoded cookie as a secret-bearing value to hash into `session:<sha256>`.
- `src/packages/auth/src/index.ts` parses `better-auth.session_token` and currently calls `decodeURIComponent(rawValue)` directly.

### Failure mode

- `decodeURIComponent("%")` throws `URIError`.
- Because the exception happens while building the limiter identity, the request never reaches `consumeRateLimit`.
- The route-level middleware does not catch this exception, so it bubbles to `app.onError` and returns `500 INTERNAL_ERROR`.
- The same parser is also used in `better-auth-service.getSession`; fixing only the API rate-limit layer would leave inconsistent semantics for malformed cookies.

### Existing behavior to preserve

- Valid encoded cookie values decode normally, for example `abc%2Edef -> abc.def`.
- Missing, empty, or unrelated cookies return `null`.
- Rate-limit keys must never contain raw session tokens.
- `/api/auth/session` without a usable session returns the existing `401 UNAUTHORIZED` envelope.

## Recommended Fix

### Primary code change

Change `getSessionCookieValue` in `src/packages/auth/src/index.ts` so malformed percent-encoding returns `null` instead of throwing.

Recommended shape:

```ts
try {
  return decodeURIComponent(rawValue);
} catch (error) {
  if (error instanceof URIError) {
    return null;
  }

  throw error;
}
```

Rationale:

- The malformed cookie is external input, so it should not become an internal exception.
- Returning `null` aligns with existing "no supported session cookie" behavior.
- Keeping the catch limited to `URIError` avoids swallowing unrelated programmer/runtime errors.
- The fix protects both rate-limit identity generation and auth session lookup because both use the shared parser.

### Tests

Add focused regression coverage:

- `src/packages/auth/src/index.test.ts`
  - malformed `better-auth.session_token=%` returns `null`;
  - malformed non-session cookies are ignored as before;
  - valid encoded session cookie still decodes.
- `src/apps/api/src/rate-limit/identities.test.ts`
  - `createSessionRateLimitIdentity({ cookieHeader: "better-auth.session_token=%", ipSummary })` resolves to an `ip:<hash>` identity;
  - valid session cookie still resolves to `session:<hash>`.
- `src/apps/api/src/modules/auth/router.test.ts`
  - `GET /api/auth/session` with malformed session cookie returns `401 UNAUTHORIZED`, not `500 INTERNAL_ERROR`;
  - the auth rate limiter still consumes one `auth` key and the identity is IP-scoped.

### Verification Commands

Run the narrowest useful checks first:

- `pnpm --filter @kb/auth test`
- `pnpm --filter @kb/api test`

Then run broader quality checks if the implementation is accepted:

- `pnpm --filter @kb/auth typecheck`
- `pnpm --filter @kb/api typecheck`
- `pnpm --filter @kb/auth lint`
- `pnpm --filter @kb/api lint`

## Decision

Proceed with the shared-parser fix unless later implementation reveals Better Auth expects malformed percent-encoding to be passed through verbatim. Current repo behavior already treats unsupported or missing session cookies as `null`, so `null` is the most consistent malformed-cookie outcome.
