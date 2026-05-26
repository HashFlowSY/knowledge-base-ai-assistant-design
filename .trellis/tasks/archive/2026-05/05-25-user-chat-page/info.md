# 用户对话页面开发 Flow Note

## Current frontend contract

- `/chat` currently mounts `MockDataBoundary` and `ChatPage` reads `useMockStore`; production code must move to feature-scoped TanStack Query hooks.
- The product shape remains three columns: sessions, message stream, citation/feedback panel.
- URL state keeps `sessionId` and `citationId`.

## Backend/database assumptions

- API owns auth, tenant context, request validation, response envelopes, and error mapping.
- `@kb/rag` owns query-time chat/session contracts, retrieval fusion, rerank fallback, context assembly, citations, and feedback.
- Existing DB tables already cover `chat_sessions`, `chat_messages`, `retrieval_runs`, `retrieval_results`, `answer_citations`, and `answer_feedback`.
- Provider calls must go through provider interfaces; RAG must not call vendor SDKs directly.

## Cross-layer flow

```text
chat UI -> chat hooks -> Hono RPC chat routes -> auth/session guard
  -> chat service actor/tenant/kb authorization -> @kb/rag
  -> embedding provider + pgvector retrieval + Meilisearch keyword search
  -> RRF fusion -> bounded rerank/fallback -> context assembly
  -> chat provider -> persistence -> API envelope
  -> TanStack Query cache invalidation -> citations/feedback UI
```

## Decisions before coding

- v1 accepts one `knowledgeBaseId` per chat request.
- v1 uses non-streaming submit-question response with persisted user and assistant messages.
- Rerank unavailability falls back to fused order and caps grounding at `依据有限`.
- Fully missing retrieval context returns `未找到依据` without guessing.
- Source files touched by this task must be split before they exceed 350 lines.
