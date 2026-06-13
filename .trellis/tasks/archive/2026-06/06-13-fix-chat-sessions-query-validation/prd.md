# fix: validate chat sessions query

## Goal

Fix `GET /api/chat/sessions?knowledgeBaseId=` so invalid chat session query input is handled by the API validation middleware and returns the standard `400 VALIDATION_ERROR` response instead of falling through to the global `500 INTERNAL_ERROR` handler.

The approved scope is option B: move validation to the router-level middleware and tighten `knowledgeBaseId` to a UUID-shaped value, matching the PostgreSQL UUID-backed knowledge base id contract.

## What I Already Know

* Current task: `.trellis/tasks/06-13-fix-chat-sessions-query-validation`.
* Current route `GET /api/chat/sessions` only applies session middleware, then calls `listChatSessionsProcedure`.
* `listChatSessionsProcedure` defines a local `listChatSessionsQuerySchema` and calls `.parse()` directly on `Object.fromEntries(new URL(context.req.url).searchParams)`.
* `knowledgeBaseId=` becomes an empty string and fails `trim().min(1)`, but because this happens inside the procedure with `.parse()`, the error bypasses `respondWithValidationError`.
* The global `app.onError` maps uncaught errors to `500 INTERNAL_ERROR`.
* Existing API pattern for query validation is router-level `createQueryValidationMiddleware(...)` plus procedure-level `getValidatedInput(...)`, as used by the knowledge-base list route.
* `knowledgeBases.id` is a PostgreSQL UUID column, so non-UUID `knowledgeBaseId` values should be rejected before service/database access.
* User approved option B: invalid empty and non-UUID `knowledgeBaseId` must both return `400 VALIDATION_ERROR`.

## Requirements

* Add a chat sessions list query schema owned by the chat module, exported from `src/apps/api/src/modules/chat/types.ts`.
* The schema must treat `knowledgeBaseId` as optional, but when present it must be trimmed and must be a valid UUID.
* Attach `createQueryValidationMiddleware("listChatSessionsQuery", listChatSessionsQuerySchema)` to `GET /api/chat/sessions` in `src/apps/api/src/modules/chat/router.ts`.
* Update `listChatSessionsProcedure` to read the validated query via `getValidatedInput`, not by parsing URL search params directly.
* Remove the local inline schema from `list-sessions.ts`.
* Update the API RPC contract for `GET /api/chat/sessions` to include `400` as a possible response status.
* Preserve existing behavior when `knowledgeBaseId` is omitted: list sessions without a KB filter.
* Preserve existing behavior when `knowledgeBaseId` is a valid UUID: pass the trimmed UUID to `chatService.listSessions`.

## Acceptance Criteria

* [ ] `GET /api/chat/sessions?knowledgeBaseId=` returns HTTP 400 with `code: "VALIDATION_ERROR"` and does not call `chatService.listSessions`.
* [ ] `GET /api/chat/sessions?knowledgeBaseId=not-a-uuid` returns HTTP 400 with `code: "VALIDATION_ERROR"` and does not call `chatService.listSessions`.
* [ ] `GET /api/chat/sessions` still calls `chatService.listSessions` with an empty query object.
* [ ] `GET /api/chat/sessions?knowledgeBaseId=<valid-uuid>` calls `chatService.listSessions` with `{ knowledgeBaseId: "<valid-uuid>" }`.
* [ ] Route tests cover invalid empty, invalid non-UUID, omitted, and valid UUID query cases.
* [ ] No uncaught ZodError from this route reaches `app.onError`.

## Definition of Done

* Chat route/procedure code follows existing middleware validation patterns.
* Regression tests are added or updated in the API test suite.
* TypeScript types remain coherent across route schema, procedure input, service call, and RPC contract.
* Relevant lint/typecheck/test commands are run if permitted by the project workflow.
* Existing unrelated dirty files are not modified or reverted.

## Out of Scope

* Do not change chat session/message path param validation in this task.
* Do not change `CreateChatSessionInput` or `SubmitChatQuestionInput` schemas in `@kb/rag`.
* Do not change chat authorization behavior beyond this query validation bug.
* Do not refactor shared validation middleware.
* Do not address unrelated review findings such as Content-Type parsing, logout behavior, provider decryption, or upload multipart field names.

## Technical Notes

* Relevant route: `src/apps/api/src/modules/chat/router.ts`.
* Relevant procedure: `src/apps/api/src/modules/chat/procedures/list-sessions.ts`.
* Relevant module exports: `src/apps/api/src/modules/chat/types.ts`.
* Relevant middleware: `src/apps/api/src/middleware/validation.ts`.
* Relevant contract: `src/apps/api/src/contracts/rpc.ts`.
* Relevant tests: `src/apps/api/src/modules/chat/router.test.ts`.
* Backend guideline: API handlers own request parsing, validation, error mapping, and package orchestration.
