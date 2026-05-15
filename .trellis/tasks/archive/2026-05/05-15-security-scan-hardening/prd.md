# 修复安全扫描报告风险

## Goal

Close the actionable deferred security risks from `/tmp/codex-security-scans/knowledge-base-ai-assistant/b96973a_20260515T022802Z/report.md` at the existing package boundaries, without implementing feature surfaces that do not exist yet.

## What I Already Know

* The scan reported no current exploitable vulnerabilities.
* Deferred rows named object key traversal, URL ingestion SSRF, Better Auth token handling, and tenant foreign-key consistency.
* The current repository exposes only limited app surfaces, so the safest scope is to harden reusable package boundaries and add repeatable tests.
* The worktree already contains uncommitted changes related to database schema, storage filename sanitization, and queue URL validation. Those changes are treated as existing user work unless I add targeted edits on top.

## Assumptions

* Fixing deferred risks means adding guards and regression coverage to existing reusable helpers and schemas, not building upload/download routes, URL fetch workers, or auth runtime.
* Better Auth runtime encryption or hashing cannot be implemented until the runtime integration exists; this task should preserve schema naming/comments and document the remaining gate.

## Requirements

* Object storage keys must keep client-controlled filenames to one sanitized final path segment.
* URL ingestion payload validation must reject unsupported protocols, localhost/private-network addresses, and common textual host bypasses before any future fetcher receives the job.
* Database schema/migrations must continue to encode same-tenant parent-child consistency for tenant-owned relationships that already exist.
* Regression tests must cover the security invariants and legitimate positive cases.
* Do not broaden scope into new storage clients, fetchers, auth flows, or API routes.

## Acceptance Criteria

* [ ] Focused tests fail before any new fix for the remaining bypass being addressed.
* [ ] Object filename traversal inputs cannot escape the generated object-key prefix.
* [ ] URL ingestion rejects localhost/private IP hosts, loopback textual aliases, non-HTTP(S) protocols, and bracketed local/private IPv6 hosts.
* [ ] Existing valid public HTTP(S) URL ingestion payloads continue to parse.
* [ ] Relevant focused tests pass after the fix.
* [ ] Typecheck and lint pass for touched packages or the whole repo.

## Definition of Done

* Tests added or updated where behavior changed.
* Lint and typecheck run.
* Security scan path rechecked against the changed code.
* Remaining gaps from the scan report are explicitly stated.

## Out of Scope

* Object upload/download API implementation.
* URL fetch worker implementation, DNS resolution, redirect-hop validation, timeout, response-size, or content-type enforcement.
* Better Auth runtime token hashing/encryption implementation.
* Production deployment hardening.

## Technical Notes

* Relevant specs: `.trellis/spec/backend/security.md`, `.trellis/spec/backend/storage.md`, `.trellis/spec/backend/worker-queue.md`, `.trellis/spec/backend/database.md`, `.trellis/spec/testing/strategy.md`.
* Relevant files inspected: `src/packages/storage/src/index.ts`, `src/packages/queue/src/index.ts`, `src/packages/db/src/schema/auth.ts`, `src/packages/db/src/schema/knowledge.ts`, `src/packages/db/src/schema/rag.ts`.
* Node URL parsing normalizes several loopback IPv4 aliases such as `0177.0.0.1`, `2130706433`, `0x7f000001`, and `127.1` to `127.0.0.1`, but preserves bracketed IPv6 host text like `[::1]`.
