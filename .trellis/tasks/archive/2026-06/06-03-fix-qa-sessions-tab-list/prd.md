# Fix QA Sessions Tab List Display

## Goal

Restore the `/chat` page "会话" panel so authenticated users can see their persisted chat sessions for the selected knowledge base.

## What I Already Know

- User reported that the current QA page "会话" tab cannot display the conversation list.
- The frontend page is `src/apps/web/src/features/chat/chat-page.tsx`.
- The session panel component is `src/apps/web/src/features/chat/chat-panels.tsx`.
- Session data is loaded through `useChatSessions` in `src/apps/web/src/features/hooks/chat/chat-hooks.ts`.
- The API route is `GET /api/chat/sessions`, implemented by `src/apps/api/src/modules/chat/procedures/list-sessions.ts`.
- Backend data is ultimately returned by `createDrizzleRagChatRepository().listSessions`.

## Assumptions

- Existing auth, knowledge-base picker, session creation, message loading, and RAG answer flow should keep their current behavior.
- The fix should be scoped to the reason the session list is blank or unavailable.
- If the API request fails, the UI should expose a useful error state instead of only showing an empty panel.

## Requirements

- `/chat` must render available sessions in the left "会话" panel for the selected knowledge base.
- Existing knowledge-base filtering and actor ownership checks must remain intact.
- The page must not show a misleading empty list while the sessions query is in an error state.
- Add or update focused tests around the failure path found during investigation.

## Acceptance Criteria

- [ ] A targeted test reproduces the missing sessions-list behavior or the uncovered contract gap.
- [ ] The fix makes `useChatSessions`/`SessionList` render persisted sessions from `GET /api/chat/sessions`.
- [ ] Session-list errors are visible to the user instead of silently looking like no sessions exist.
- [ ] Relevant frontend/backend tests pass.

## Definition Of Done

- Focused tests added or updated.
- Targeted lint/typecheck/test commands pass, or any skipped checks are documented.
- No unrelated refactors or UI redesign.
- Trellis check is run before wrap-up.

## Technical Notes

- `SessionList` currently maps `sessions` directly and only shows a loading notice.
- `src/apps/api/src/modules/chat/router.test.ts` covers submitting questions and listing messages, but not listing sessions.
- `src/packages/rag/src/drizzle-records.ts` maps `knowledgeBaseId` from the first selected knowledge-base id; malformed legacy rows could break the frontend schema.
- `src/apps/web/src/features/hooks/chat/chat-hooks.test.ts` verifies typed routes but does not exercise query error or list rendering behavior.

## Cross-Layer Flow Note

```text
URL knowledgeBaseId -> useChatSessions query key/input
  -> Hono RPC GET /api/chat/sessions?knowledgeBaseId=...
  -> list-sessions query schema
  -> requireChatActor auth/session
  -> RAG service authorizes knowledgeBaseId when provided
  -> Drizzle repository filters tenant/user/deleted/selectedKnowledgeBaseIds
  -> ChatSessionsResponse schema
  -> SessionList render/loading/error/empty states
```

- Contract owner for session response shape: `@kb/rag` schemas.
- Contract owner for API envelope/RPC route: `src/apps/api/src/contracts/rpc.ts`.
- UI owner for loading/empty/error display: `src/apps/web/src/features/chat`.

## Out Of Scope

- Multi-knowledge-base chat sessions.
- Changes to RAG retrieval, answer generation, citations, or feedback behavior.
- New visual design for the chat page.
