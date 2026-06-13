# Fix API UUID Path Param Validation

## Goal

Ensure API routes with UUID-backed path parameters reject malformed identifiers at the router validation boundary with the standard `400 VALIDATION_ERROR` envelope before service or database calls.

## What I Already Know

- The previous review finding was about UUID path params reaching service/database code without UUID validation.
- Current code has already fixed chat sessions query validation in `src/apps/api/src/modules/chat/types.ts` and `src/apps/api/src/modules/chat/router.ts`.
- API specs require every endpoint to validate path params, query params, JSON bodies, and multipart metadata before domain calls.
- API module guidelines prefer router-level middleware for shared HTTP concerns and procedures reading already-validated input through `getValidatedInput`.
- `auth_users.id` is `text`, not UUID, so `/api/users/:userId` must not be included in this UUID validation task.

## Affected UUID-Backed Params

- `knowledgeBaseId`
  - `GET /api/knowledge-bases/:knowledgeBaseId`
  - `PATCH /api/knowledge-bases/:knowledgeBaseId`
  - `POST /api/knowledge-bases/:knowledgeBaseId/documents/upload`
  - `GET /api/knowledge-bases/:knowledgeBaseId/documents/processing`
  - `POST /api/knowledge-bases/:knowledgeBaseId/documents/:documentId/retry`
- `documentId`
  - `POST /api/knowledge-bases/:knowledgeBaseId/documents/:documentId/retry`
- `sessionId`
  - `GET /api/chat/sessions/:sessionId/messages`
- `messageId`
  - `POST /api/chat/messages/:messageId/feedback`

## Requirements

- Define domain-owned Zod path param schemas using `z.string().uuid()` for UUID-backed params.
- Mount `createParamValidationMiddleware` on every affected route before procedures execute.
- Update procedures to read validated params from `getValidatedInput` instead of `context.req.param(...)`.
- Update document upload preflight so invalid `knowledgeBaseId` returns the standard validation envelope before upload rate/concurrency reservation and before document service calls.
- Keep `/api/users/:userId` unchanged because Better Auth user ids are text and may include legacy non-UUID values.
- Update Hono RPC status unions to include `400` for GET routes that gain param validation.
- Update tests and fixtures from non-UUID ids such as `kb_1`, `doc_1`, `chat_1`, and `msg_a` where those values now cross UUID path params.

## Acceptance Criteria

- [ ] Invalid UUID path params return HTTP `400` with `code: "VALIDATION_ERROR"`.
- [ ] Invalid UUID path params do not call the owning domain service.
- [ ] Valid UUID path params still reach services with the expected string ids.
- [ ] Existing auth, origin, content-type, rate-limit, and no-body middleware ordering remains intact.
- [ ] Hono RPC route status unions include `400` where route-level param validation can now reject.
- [ ] Relevant API tests cover invalid UUID path params for KB detail/update, document upload/processing/retry, chat messages, and chat feedback.

## Out of Scope

- Do not validate `userId` as UUID.
- Do not change database schema or domain package service contracts.
- Do not address unrelated review findings such as content-type exact matching or multipart field name validation.

## Technical Notes

- Relevant specs:
  - `.trellis/spec/backend/api-contract.md`
  - `.trellis/spec/backend/api-module.md`
  - `.trellis/spec/backend/security.md`
  - `.trellis/spec/shared/typescript.md`
- Relevant API files:
  - `src/apps/api/src/middleware/validation.ts`
  - `src/apps/api/src/middleware/upload.ts`
  - `src/apps/api/src/modules/knowledge-bases/{router.ts,types.ts,procedures/*.ts}`
  - `src/apps/api/src/modules/documents/{router.ts,types.ts,procedures/*.ts}`
  - `src/apps/api/src/modules/chat/{router.ts,types.ts,procedures/*.ts}`
  - `src/apps/api/src/contracts/rpc.ts`
- DB confirmation:
  - `src/packages/db/src/schema/knowledge.ts` uses UUID for knowledge base and document ids.
  - `src/packages/db/src/schema/rag.ts` uses UUID for chat session and message ids.
  - `src/packages/db/src/schema/auth.ts` uses text for auth user ids.
