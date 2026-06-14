# Fix API Trusted Client IP for Rate Limiting

## Goal

Fix the API bug where unauthenticated IP-scoped rate limits and audit metadata
trust client-controlled `X-Forwarded-For`. The API should derive a client IP
summary from a server-controlled remote address and ignore forwarded headers.

## What I Already Know

- User requested task creation and a reviewable plan before implementation.
- The plan was approved with the server-remote-address-only approach, and the
  task is now in implementation.
- Current implementation is centralized in
  `src/apps/api/src/guards/session/request.ts`.
- `getRequestIpSummary(context)` currently returns the first
  `x-forwarded-for` value or the hard-coded fallback `127.0.0.1`.
- The helper feeds all IP-scoped unauthenticated limiter identities:
  login, auth-session fallback, unresolved user-management, unresolved
  knowledge-base, and unresolved document-upload.
- The same helper also feeds audit/provider/upload `ipSummary` metadata, so the
  fix must cover both rate limiting and security/audit attribution.
- Hono Node server version in the lockfile is `@hono/node-server 1.19.14`, and
  it exposes `getConnInfo(context).remote.address` from
  `incoming.socket.remoteAddress`.
- Current runtime config has no trusted proxy or client IP policy setting.

## Requirements

- Do not trust `X-Forwarded-For` by default.
- Use a server-controlled remote address as the default IP summary source for
  Node/Hono requests.
- Avoid the current hard-coded `127.0.0.1` fallback for production traffic when
  a remote address is available.
- Keep `getRequestIpSummary(context)` as the single API helper used by rate
  limits, audit, provider, and upload code unless implementation uncovers a
  stronger local pattern.
- Preserve the current one-limiter-per-request behavior controlled by
  `rateLimitCounted`.
- Preserve hashing of IP summaries inside rate-limit identities; raw IP values
  must not be embedded in Redis keys.
- Add focused regression coverage proving spoofed `X-Forwarded-For` does not
  affect the default limiter identity.

## Acceptance Criteria

- [ ] A request with different `X-Forwarded-For` values but the same server
      remote address consumes the same unauthenticated IP limiter identity.
- [ ] A request with no `X-Forwarded-For` and an available server remote address
      uses the server remote address, not `127.0.0.1`.
- [ ] Existing authenticated actor/session limiters still use actor/session
      identities as before.
- [ ] Audit/provider/upload `ipSummary` callers use the same trusted client IP
      helper.
- [ ] Unit or route tests cover the spoofing regression and the fallback
      behavior.
- [ ] API lint/typecheck and relevant tests pass before finish.

## Approved Technical Approach

Implement a small trusted client IP resolver in the API layer:

1. Update `getRequestIpSummary(context)` to prefer
   `getConnInfo(context).remote.address` from `@hono/node-server/conninfo`.
2. Normalize the address enough for stable summaries, including IPv4-mapped IPv6
   values such as `::ffff:203.0.113.10`.
3. Ignore `X-Forwarded-For` by default.
4. Keep a conservative fallback for non-Node test/runtime contexts where
   `getConnInfo` cannot provide an address. The fallback should be explicit,
   stable, and documented as only for missing connection metadata.
5. Add tests around the helper or route-level consumed limiter identities.

This is the approved MVP because it closes the spoofing bug without adding a new
deployment knob whose exact proxy topology has not been specified.

## Decision (ADR-lite)

**Context**: The API currently trusts a client-controlled forwarded header for
IP-scoped rate limits and security/audit metadata.

**Decision**: Use Node socket remote address via Hono `getConnInfo` as the IP
summary source and ignore `X-Forwarded-For`.

**Consequences**: This fails closed against spoofed forwarded headers. In
deployments behind a reverse proxy, the API will use the proxy socket address
until a future task introduces an explicit trusted-proxy policy.

## Out of Scope

- Reworking rate-limit thresholds or windows.
- Changing Redis key format beyond the input IP summary source.
- Adding geo/IP reputation logic.
- Adding trusted-proxy or forwarded-header parsing in this task.
- Fixing unrelated review findings from the previous scan.

## Technical Notes

- Relevant specs:
  - `.trellis/spec/backend/security.md`
  - `.trellis/spec/backend/api-contract.md`
  - `.trellis/spec/shared/typescript.md`
  - `.trellis/spec/shared/config.md`
- Research notes:
  - `research/current-ip-rate-limit-logic.md`
- Relevant current code:
  - `src/apps/api/src/guards/session/request.ts`
  - `src/apps/api/src/guards/session/rate-limits.ts`
  - `src/apps/api/src/guards/session/audit.ts`
  - `src/apps/api/src/modules/documents/lib/upload-audit.ts`
  - `src/apps/api/src/modules/documents/procedures/upload-document-file.ts`
  - `src/apps/api/src/modules/providers/procedures/save-provider.ts`
  - `src/apps/api/src/middleware/request-context.ts`
  - `src/apps/api/src/contracts/context.ts`
  - `src/apps/api/src/server.ts`
  - `src/packages/config/src/index.ts`
