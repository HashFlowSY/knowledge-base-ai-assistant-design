# API Middleware Refactor Implementation Plan

> For agentic workers: implement task-by-task with strict ownership. Do not change Trellis task state, do not commit, and do not edit outside assigned files.

**Goal:** Move repeated API route guard logic into explicit Hono middleware mounted at router level while preserving existing auth, rate-limit, audit, validation, and response-envelope behavior.

**Architecture:** Keep `src/apps/api` as the HTTP adapter owner. Add middleware factories under `src/apps/api/src/middleware/`, keep existing domain procedures thin, and use typed context variables/helpers to read request-scoped actor/body/query/params values. Domain services continue to own object-level authorization and tenant data filtering.

**Tech Stack:** Hono on Node.js, TypeScript, Zod, existing `@kb/*` packages, existing rate limiter and auth service abstractions, Vitest test suite.

---

## File Structure

Create:

* `src/apps/api/src/middleware/request-context.ts` — request id/logger middleware currently inline in `app.ts`.
* `src/apps/api/src/middleware/rate-limit.ts` — generic limiter consumption middleware/helpers with once-per-request guard.
* `src/apps/api/src/middleware/mutation.ts` — origin/sec-fetch/content-type/no-body mutation guards.
* `src/apps/api/src/middleware/auth.ts` — session resolution, actor/tenant context, admin role middleware.
* `src/apps/api/src/middleware/validation.ts` — JSON body, query, and params validation middleware plus typed access helpers.
* `src/apps/api/src/middleware/upload.ts` — document-upload preflight and concurrency middleware.
* `src/apps/api/src/middleware/index.ts` — exports.

Modify:

* `src/apps/api/src/contracts/context.ts` — add context variables for auth, rate-limit flag, validated inputs, upload reservation/context.
* `src/apps/api/src/app.ts` — use request context middleware; keep global error mapping.
* `src/apps/api/src/guards/**` — retain compatibility exports where useful, or remove unused guard logic after router migration.
* `src/apps/api/src/modules/*/router.ts` — mount route-level middleware in the required order.
* `src/apps/api/src/modules/*/procedures/**/*.ts` — remove duplicated guard/validation preambles and read typed context values.
* `src/apps/api/src/http/service-errors.ts` or `src/apps/api/src/app.ts` — ensure unhandled Zod validation is not returned as 500 when middleware/helper is expected to handle it.
* Existing tests under `src/apps/api/src/**`.

---

## Task 1: Context And Middleware Foundation

Files:

* Create: `src/apps/api/src/middleware/request-context.ts`
* Create: `src/apps/api/src/middleware/rate-limit.ts`
* Create: `src/apps/api/src/middleware/index.ts`
* Modify: `src/apps/api/src/contracts/context.ts`
* Modify: `src/apps/api/src/app.ts`
* Test: `src/apps/api/src/http/error-handling.test.ts`

Steps:

1. Write/update tests that assert request context still sets `X-Request-Id`, includes `requestId` in unhandled errors, and logs request completion.
2. Add `session`, `actor`, `tenantId`, and `rateLimitCounted` to `ApiContextVariables`.
3. Move the inline request context function from `app.ts` into `createRequestContextMiddleware(logger)`.
4. Add `consumeRateLimitOnce(context, rateLimiter, input)` that returns `null` when allowed and sets `Retry-After` plus standard `RATE_LIMITED` envelope when blocked. It must mark `rateLimitCounted` before returning so later middleware cannot consume another key.
5. Update `app.ts` to use `createRequestContextMiddleware`.
6. Run targeted request/error tests and fix regressions before continuing.

## Task 2: Mutation And Validation Middleware

Files:

* Create: `src/apps/api/src/middleware/mutation.ts`
* Create: `src/apps/api/src/middleware/validation.ts`
* Modify: `src/apps/api/src/guards/mutation.ts` if compatibility wrappers are still needed.
* Test: `src/apps/api/src/guards/mutation.test.ts`
* Test: representative router tests for chat/users/knowledge-bases.

Steps:

1. Write tests proving invalid origin and invalid content-type are rejected before handlers for a representative JSON mutation route.
2. Write tests proving chat POST routes reject invalid origin/content-type.
3. Add `createMutationGuardMiddleware(allowedOrigins)` and `createJsonMutationGuardMiddleware(allowedOrigins)`.
4. Add `createNoBodyGuardMiddleware()` for DELETE/logout routes that must reject request bodies.
5. Add `createJsonBodyValidationMiddleware(key, schema)`, `createQueryValidationMiddleware(key, schema)`, and `createParamValidationMiddleware(key, schema)`.
6. Add typed helpers such as `getValidatedBody<T>(context, key)`, `getValidatedQuery<T>(context, key)`, and `getValidatedParams<T>(context, key)`.
7. Ensure validation failures return `VALIDATION_ERROR` with validationErrors from Zod.
8. Run mutation and representative validation tests.

## Task 3: Auth, Admin, And Rate-Limit Middleware

Files:

* Create: `src/apps/api/src/middleware/auth.ts`
* Modify: `src/apps/api/src/guards/session/**` only if existing helpers can delegate to middleware primitives.
* Test: `src/apps/api/src/modules/auth/router.test.ts`
* Test: `src/apps/api/src/modules/users/router.test.ts`
* Test: `src/apps/api/src/modules/knowledge-bases/router.test.ts`
* Test: `src/apps/api/src/modules/providers/router.test.ts`

Steps:

1. Write tests proving unauthenticated protected requests still forward auth cleanup `Set-Cookie` headers.
2. Write tests proving member admin attempts still record forbidden audit and do not call service handlers.
3. Write tests proving unauthenticated failure and authenticated failure consume only one limiter key.
4. Implement `createSessionMiddleware({ authService, rateLimiter, scope, limits })` for knowledge-base/user-management/auth-session style routes.
5. Implement `createAdminMiddleware({ auditService })` that reads actor from context and records forbidden audit.
6. Implement helper accessors `getRequiredActor(context)` and `getKnowledgeActor(context)` or equivalent.
7. Mount these middleware in users, knowledge-bases, providers, documents, and chat routers.
8. Refactor procedures to remove local session/admin/rate-limit preambles.
9. Run targeted auth/admin route tests.

## Task 4: Router-Level Procedure Refactor

Files:

* Modify all affected router/procedure files under:
  * `src/apps/api/src/modules/auth/`
  * `src/apps/api/src/modules/users/`
  * `src/apps/api/src/modules/knowledge-bases/`
  * `src/apps/api/src/modules/documents/`
  * `src/apps/api/src/modules/chat/`
  * `src/apps/api/src/modules/providers/`
* Test: corresponding router/procedure tests.

Steps:

1. For each router, mount middleware in the PRD order: mutation/content guard before session where early failures must be counted as unresolved; session before admin; validation before handler when it consumes the body.
2. For each procedure, replace `authResult.actor` with context actor helpers.
3. Replace repeated `readJsonBody`/`safeParse` with validated body helpers.
4. Replace query parsing with validated query helpers.
5. Keep path param checks explicit where Hono can theoretically return empty params; use params validation middleware when route contracts have reusable schemas.
6. Keep all service calls and response envelopes explicit.
7. Run each module test after its refactor before moving to the next module.

## Task 5: Document Upload Preflight

Files:

* Create: `src/apps/api/src/middleware/upload.ts`
* Modify: `src/apps/api/src/modules/documents/router.ts`
* Modify: `src/apps/api/src/modules/documents/procedures/upload-document-file.ts`
* Test: `src/apps/api/src/modules/documents/procedures/upload-document-file/guards/auth-rate-limit.test.ts`
* Test: `src/apps/api/src/modules/documents/procedures/upload-document-file/concurrency/concurrency.test.ts`
* Test: `src/apps/api/src/modules/documents/procedures/upload-document-file/validation/validation.test.ts`
* Test: `src/apps/api/src/modules/documents/procedures/upload-document-file/responses/success.test.ts`

Steps:

1. Write/confirm tests for invalid origin, unsupported upload content-type, unauthenticated upload, actor upload rate limit, and concurrency exhaustion.
2. Implement upload preflight middleware for mutation guard, multipart content-type, session, upload rate limit, knowledgeBaseId extraction, and concurrency acquire/release.
3. Store upload actor, knowledgeBaseId, and reservation in context.
4. Refactor upload handler so it starts at reserved upload processing and leaves parseContentLength/formData/file validation/checksum/service call intact.
5. Ensure reservation release happens in middleware `finally` around `await next()`.
6. Run all upload-specific tests.

## Task 6: Final Verification And Cleanup

Files:

* Modify tests only if behavior changed intentionally and PRD covers it.
* Remove unused imports/functions after migration.

Steps:

1. Run `pnpm --filter @kb/api test` or the existing package-level equivalent from `src/apps/api/package.json`.
2. Run project lint and typecheck scripts discovered from package manifests.
3. Search for remaining duplicated preambles:
   * `requireKnowledgeBaseSession(`
   * `requireAdminUserManagementSession(`
   * `requireAdminKnowledgeBaseSession(`
   * `validateJsonMutationRequest(`
   * `validateMutationRequest(`
   * `readJsonBody(`
4. Any remaining occurrence must either be a compatibility wrapper/test or have a documented reason.
5. Review changed files against `.trellis/spec/backend/api-contract.md`, `.trellis/spec/backend/security.md`, and `.trellis/spec/backend/logging.md`.
6. Decide whether spec updates are needed.

---

## Self-Review

* Spec coverage: all PRD middleware categories have an implementation task.
* Ambiguity resolved: user selected complete router-level middleware refactor.
* Main risk: preserving the current early-failure rate-limit behavior and one-limiter-key rule. Tasks 1, 3, and 5 explicitly test this.
* Main non-goal: object-level knowledge-base/document/chat authorization stays in service/domain calls.
