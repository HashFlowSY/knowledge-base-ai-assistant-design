# Current KB Authorization State

## Summary

当前 KB 权限规则分散在三层：

1. API middleware 解析 session、注入 actor、限制 admin role，但不按具体 `knowledgeBaseId` 做权限判断。
2. `@kb/knowledge` 拥有最完整的 KB 可见性规则：tenant scope、未删除、admin 可见全部、member 只能看 `knowledge_base_members` 中分配的 KB。
3. `@kb/rag` 拥有一份重复的 KB membership SQL，并且 chat read/feedback 路径没有统一使用它。

High 问题的根因不是 retrieval filter 缺失，而是历史 chat session/message/feedback 读取路径只校验 session/message 归属，没有从 session 的 `selectedKnowledgeBaseIds` 反查当前 KB 可见性。

## Current Flow

```text
API chat router
  -> createKnowledgeBaseSessionMiddleware
  -> getRequiredActor
  -> ChatService (@kb/rag)
  -> RagChatRepository
  -> chat_sessions / chat_messages / answer_citations / answer_feedback
```

Current behavior:

- `createSession` and `submitQuestion` call `authorizeKnowledgeBase` before using a request body `knowledgeBaseId`.
- `listSessions` only calls `authorizeKnowledgeBase` when `query.knowledgeBaseId` is present. Without the query, it lists all sessions owned by the actor.
- `listMessages` calls `getSession` by `sessionId` without `knowledgeBaseId`, then returns messages.
- `submitFeedback` calls `canAccessMessage`, which checks tenant/user/session ownership and assistant role, but not current KB visibility.

## KB Permission Code Files

### API auth and middleware

- `src/apps/api/src/middleware/auth.ts`
  - Creates authenticated/admin middleware wrappers.
  - Sets `actor`, `session`, `tenantId`, and logger context.
  - Converts session actor to `KnowledgeActor`.
- `src/apps/api/src/guards/actors.ts`
  - `toKnowledgeActor` maps `SessionPayload` to `KnowledgeActor`.
- `src/apps/api/src/guards/session/knowledge-session.ts`
  - Authenticates any KB-domain route and applies KB route rate limit.
  - Does not authorize a specific KB id.
- `src/apps/api/src/guards/session/admin-session.ts`
  - Builds admin-only guards on top of authenticated session.
- `src/apps/api/src/guards/session/audit.ts`
  - Records forbidden admin attempts.
- `src/apps/api/src/guards/session/rate-limits.ts`
  - Provides actor/IP scoped route limiters.
- `src/apps/api/src/contracts/context.ts`
  - Defines request context variables used by middleware.

### API chat routes and procedures

- `src/apps/api/src/modules/chat/router.ts`
  - Mounts session middleware, mutation guards, and body validation.
  - Read routes do not carry specific KB authorization middleware.
- `src/apps/api/src/modules/chat/procedures/create-session.ts`
  - Passes actor and validated body to chat service.
- `src/apps/api/src/modules/chat/procedures/submit-question.ts`
  - Passes actor, validated body, and request id to chat service.
- `src/apps/api/src/modules/chat/procedures/list-sessions.ts`
  - Parses optional `knowledgeBaseId` query locally and calls chat service.
- `src/apps/api/src/modules/chat/procedures/list-messages.ts`
  - Reads `sessionId` and calls chat service.
- `src/apps/api/src/modules/chat/procedures/submit-feedback.ts`
  - Reads `messageId`, validated body, and calls chat service.
- `src/apps/api/src/modules/chat/procedures/helpers.ts`
  - Maps chat service results to API envelopes.

### API KB/document routes using knowledge permissions

- `src/apps/api/src/modules/knowledge-bases/router.ts`
  - Uses authenticated middleware for reads and admin middleware for create/update.
- `src/apps/api/src/modules/knowledge-bases/procedures/list-knowledge-bases.ts`
- `src/apps/api/src/modules/knowledge-bases/procedures/get-knowledge-base.ts`
- `src/apps/api/src/modules/knowledge-bases/procedures/create-knowledge-base.ts`
- `src/apps/api/src/modules/knowledge-bases/procedures/update-knowledge-base.ts`
  - These pass `KnowledgeActor` to `KnowledgeBaseService`.
- `src/apps/api/src/modules/documents/router.ts`
- `src/apps/api/src/modules/documents/procedures/list-document-processing.ts`
- `src/apps/api/src/modules/documents/procedures/retry-document-processing.ts`
- `src/apps/api/src/modules/documents/procedures/upload-document-file.ts`
  - Document operations call `KnowledgeBaseService`, whose operations check KB visibility/membership.

### API contracts/runtime

- `src/apps/api/src/contracts/services.ts`
  - Defines `ChatService`, `KnowledgeBaseService`, `DocumentService`, and `AuthService` app-facing contracts.
- `src/apps/api/src/contracts/rpc.ts`
  - Defines API route contract shapes.
- `src/apps/api/src/runtime/services.ts`
  - Wires real `KnowledgeBaseService` and `RagChatService`.
- `src/apps/api/src/runtime/knowledge-adapter.ts`
  - Normalizes knowledge actor when adapting document and KB services.

### Knowledge package

- `src/packages/knowledge/src/index.ts`
  - Browser-safe contracts and `KnowledgeActor` type export.
- `src/packages/knowledge/src/service.ts`
  - Server-only `createKnowledgeBaseService` entrypoint.
- `src/packages/knowledge/src/service/types.ts`
  - Defines `KnowledgeActor` and `KnowledgeBaseService`.
- `src/packages/knowledge/src/service/queries.ts`
  - `createVisibleKnowledgeBaseConditions` is the strongest current owner of KB visibility.
  - `findVisibleKnowledgeBaseRow` applies the visibility rule to a specific KB.
  - `actorIsKnowledgeBaseMember` checks direct KB membership.
- `src/packages/knowledge/src/operations/knowledge-bases/list.ts`
  - Lists only visible KB rows.
- `src/packages/knowledge/src/operations/knowledge-bases/get.ts`
  - Reads one visible KB row.
- `src/packages/knowledge/src/operations/knowledge-bases/create.ts`
  - Admin-only create and member assignment.
- `src/packages/knowledge/src/operations/knowledge-bases/update.ts`
  - Admin-only update and member reassignment.
- `src/packages/knowledge/src/operations/upload-document-file/access/authorization.ts`
  - Explicit KB write authorization for uploads, including audit on forbidden member attempts.
- `src/packages/knowledge/src/operations/upload-document-file/index.ts`
  - Calls upload authorization before object/db side effects.
- `src/packages/knowledge/src/operations/document-processing/list.ts`
  - Uses `findVisibleKnowledgeBaseRow` before returning processing rows.
- `src/packages/knowledge/src/operations/document-processing/retry.ts`
  - Uses `findVisibleKnowledgeBaseRow` before retry logic.

### RAG package

- `src/packages/rag/src/service-types.ts`
  - Defines `RagActor`, `RagChatService`, and `RagChatRepository`.
  - `RagActor` duplicates the same shape as `KnowledgeActor`.
- `src/packages/rag/src/service.ts`
  - Performs partial KB authorization:
    - create session: yes.
    - submit question: yes.
    - list sessions with query KB: yes.
    - list sessions without query KB: no current KB filter.
    - list messages: no current KB authorization.
    - submit feedback: no current KB authorization.
- `src/packages/rag/src/drizzle-runs.ts`
  - Defines `actorCanAccessKnowledgeBase`, duplicating the membership SQL already present in `@kb/knowledge`.
  - Also writes retrieval runs/results.
- `src/packages/rag/src/drizzle-repository.ts`
  - Implements session/message access queries.
  - `getSession`, `listMessages`, `listRecentMessages`, `listSessions`, and `canAccessMessage` currently use tenant/user/session filters but do not consistently apply current KB visibility.
  - `selectedKnowledgeBaseContains` checks JSON selected KB membership on chat sessions.
- `src/packages/rag/src/drizzle-feedback.ts`
  - Writes feedback after looking up message metadata by tenant/message id.
- `src/packages/rag/src/drizzle-records.ts`
  - Hydrates messages with citations and feedback; authorization must happen before rows reach this mapper.
- `src/packages/rag/src/drizzle-vector.ts`
  - Vector retrieval filters by tenant and `knowledgeBaseId`.
- `src/packages/rag/src/service-helpers.ts`
  - Keyword/vector retrieval is called only after service-level target KB authorization for `submitQuestion`.
- `src/packages/rag/src/service.test.ts`
- `src/packages/rag/src/service.test-fixtures.ts`
  - Existing service tests should be extended for revoked/current KB access cases.

### Search package

- `src/packages/search/src/query.ts`
  - Meilisearch keyword retrieval filters by tenant and `knowledgeBaseId`.

### Database schema

- `src/packages/db/src/schema/knowledge.ts`
  - `knowledge_bases`, `knowledge_base_members`, `documents`, chunks and related KB-owned content.
- `src/packages/db/src/schema/rag.ts`
  - `chat_sessions.selectedKnowledgeBaseIds` stores selected KB ids.
  - `chat_messages` belongs to session.
  - `retrieval_runs.selectedKnowledgeBaseIds`, `retrieval_results.knowledgeBaseId`, and `answer_citations.knowledgeBaseId` preserve KB context.
  - `answer_feedback` points to message and retrieval run, but not directly to KB.

## Current Gaps

- Permission rule duplication:
  - `@kb/knowledge` has `createVisibleKnowledgeBaseConditions`.
  - `@kb/rag` has `actorCanAccessKnowledgeBase`.
  - These can drift.
- API middleware names imply KB protection, but `createKnowledgeBaseSessionMiddleware` only means authenticated KB-domain route, not specific KB authorization.
- Chat read paths use historical ownership rather than current KB visibility.
- Feedback writes rely on a prior `canAccessMessage` check that does not know current KB visibility.
- `RagActor` and `KnowledgeActor` duplicate shape.

## Recommended Unified Fix

Do not patch each API procedure. Instead:

1. Move/expose KB access primitives from `@kb/knowledge` server-only API.
   - Candidate owner: `src/packages/knowledge/src/service/permissions.ts`.
   - Export through a server-only package subpath such as `@kb/knowledge/permissions`.
   - Keep browser-safe `@kb/knowledge` root free of database-backed helpers.
2. Let `@kb/rag` reuse those primitives.
   - Add `@kb/knowledge` as a dependency of `@kb/rag`.
   - Replace `actorCanAccessKnowledgeBase` in `src/packages/rag/src/drizzle-runs.ts`.
   - Consider `type RagActor = KnowledgeActor` to avoid role/tenant/user drift.
3. Centralize chat access conditions inside `src/packages/rag/src/drizzle-repository.ts`.
   - Use one helper for accessible sessions by actor.
   - Apply it to session listing, session lookup, message listing, recent history, message access, and feedback writes.
   - Keep `selectedKnowledgeBaseContains` as chat-session-specific storage logic, but combine it with shared KB visibility.
4. Keep service orchestration explicit.
   - `RagChatService` should still make authorization boundaries visible before retrieval or write operations.
   - Repository methods must also be safe because read/write operations can race with membership changes.

## Suggested Tests

- RAG service/repository tests:
  - member with revoked KB cannot list old sessions.
  - member with revoked KB cannot list messages for old session.
  - member with revoked KB cannot submit feedback to old assistant message.
  - admin can still access tenant sessions after member assignment changes.
  - authorized member behavior remains unchanged.
- API tests:
  - Add only enough router coverage to ensure service errors map to the standard envelope.
  - Avoid relying only on router mocks for authorization correctness.

## Decision

Return behavior for revoked historical chat resources:

- Use `NOT_FOUND` for session/message/feedback-by-id paths, preserving the existing "会话或消息不存在，或你没有访问权限。" behavior and avoiding resource existence leaks.
- Keep `FORBIDDEN` for explicit KB-targeted operations where the request directly supplies a disallowed `knowledgeBaseId`.
