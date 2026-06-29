# SSE 流式聊天输出 Implementation Plan

## Phase 0: Planning Gate

- [x] Resolve the persistence boundary: do not persist provider-incomplete partial assistant answers; persist final assistant answers once provider generation completes and final persistence starts, even if delivery fails.
- [ ] Review `prd.md` and `design.md`.
- [ ] Start the Trellis task only after planning approval.

## Phase 1: Shared Contracts

- [ ] Add chat stream event Zod schemas and inferred types in `src/packages/rag/src/types.ts`.
- [ ] Encode the minimum payload contract for `session`, `user_message`, `retrieval_started`, `retrieval_completed`, `answer_delta`, `answer_completed`, and `error`, including `requestId` and available session/message/retrieval ids.
- [ ] Define stable SSE event id sequencing as `<requestId>:<sequence>`.
- [ ] Document and test that stream event ids are not replay cursors; MVP ignores `Last-Event-ID` and reconciles by refetch.
- [ ] Export the new event schemas/types from `@kb/rag`.
- [ ] Add unit tests for valid/invalid stream event payloads and event-order helper behavior where represented in pure code.

Validation:

```bash
pnpm --filter @kb/rag test
pnpm --filter @kb/rag typecheck
```

## Phase 2: Provider Streaming Adapter

- [ ] Extend provider chat service types with a streaming method that accepts an optional caller `AbortSignal`.
- [ ] Implement OpenAI-compatible SSE parsing in `src/packages/ai-providers/src/runtime/runtime-service.ts` or a focused helper module.
- [ ] Combine provider timeout with the caller signal so browser/API abort cancels upstream `fetch` and response body reading.
- [ ] Keep `generate()` unchanged for non-streaming calls.
- [ ] Add deterministic tests for delta frames, `[DONE]`, empty chunks, split chunks, malformed JSON, non-2xx responses, timeout, caller abort, and missing response body.

Validation:

```bash
pnpm --filter @kb/ai-providers test
pnpm --filter @kb/ai-providers typecheck
```

## Phase 3: RAG Streaming Service

- [ ] Add `streamQuestion` to the `RagChatService` interface with an input `signal?: AbortSignal`.
- [ ] Extract shared submit preparation helpers from current `submitQuestion` where useful: authorization/session, user message append, retrieval run lifecycle, retrieval/rerank/context assembly.
- [ ] Implement `streamQuestion` as an `AsyncIterable` of chat stream events.
- [ ] Implement required event order for grounded answer, no-answer, retrieval failure, provider failure, and cancellation/disconnect branches.
- [ ] Accumulate answer deltas before final assistant message persistence.
- [ ] Preserve no-answer behavior when retrieval returns no citations.
- [ ] Preserve non-streaming provider-failure behavior only when no answer delta has been sent: persist the model-unavailable fallback assistant and emit `answer_completed`.
- [ ] After one or more answer deltas, provider failure emits `error` and does not persist partial/fallback assistant messages.
- [ ] On caller abort before retrieval run completion, mark the run `failed` with safe `client_aborted` metadata; after retrieval completion but before provider completion, do not rewrite the completed run and do not append an assistant message.
- [ ] Once provider stream receives `[DONE]` or the internal provider iterator completes normally and final persistence starts, persist assistant message/citations/grounding label even if the client disconnects before receiving `answer_completed`.
- [ ] Add service tests for event order, successful streaming, no-answer, provider failure before delta, provider failure after delta, retrieval failure, cancellation before provider completion, and disconnect after provider `[DONE]`/iterator done.

Validation:

```bash
pnpm --filter @kb/rag test
pnpm --filter @kb/rag typecheck
```

## Phase 4: API SSE Endpoint

- [ ] Extend `ChatService` app contract with `streamQuestion`.
- [ ] Add default unimplemented service method.
- [ ] Add `POST /api/chat/messages/stream` to the chat router with the same mutation/session/body validation middleware as the existing submit route.
- [ ] Add a stream procedure that serializes RAG events to SSE frames.
- [ ] Serialize stable SSE `id:` fields as `<requestId>:<sequence>` and include `requestId` in event payloads.
- [ ] Do not implement `Last-Event-ID` replay for the SSE MVP; reconnect behavior is normal message refetch.
- [ ] Pass `context.req.raw.signal` into `chatService.streamQuestion` so browser abort and HTTP disconnect propagate to RAG/provider.
- [ ] Map post-header failures to safe `error` events.
- [ ] Update Hono RPC route types only where useful; frontend will use raw `fetch` for incremental reading.
- [ ] Add API route tests for content type, middleware validation, service input including abort signal, emitted SSE id/payload/frame order, no replay expectation, and auth/validation failures.

Validation:

```bash
pnpm --filter @kb/api test
pnpm --filter @kb/api typecheck
```

## Phase 5: Frontend Streaming Hook

- [ ] Add SSE parser utility and tests under the chat hook/feature area.
- [ ] Add `useSubmitChatQuestionStream` or a workflow hook that exposes stream state, latest events, error, and cancel action.
- [ ] Use `fetch` with `credentials: "include"` and `content-type: application/json`.
- [ ] Before parsing SSE, handle non-2xx or non-`text/event-stream` responses by parsing the existing safe JSON error envelope and exposing the Chinese error message.
- [ ] Parse events with `@kb/rag` schemas.
- [ ] Abort the fetch through `AbortController` for user cancellation; remove the temporary assistant bubble and treat reader abort/disconnect as `cancelled`/`error` UI state without persisting temporary assistant text.
- [ ] Invalidate sessions and the streamed session's messages on completion, cancellation, and stream-time error when a `session` event was received.
- [ ] Add tests for parser behavior, hook exports, requestId/event id parsing, non-SSE JSON error handling, cancellation state, completion invalidation, and no mock-store regression.

Validation:

```bash
pnpm --filter @kb/web test
pnpm --filter @kb/web typecheck
```

## Phase 6: Chat UI Integration

- [ ] Update `ChatPage` to use the streaming workflow for submit.
- [ ] Render temporary user and assistant messages while stream is active.
- [ ] On `session` event, immediately switch URL/selected session to the emitted session and clear `citationId`.
- [ ] Show phase copy for retrieval and generation.
- [ ] Keep citation panel disabled or empty until `answer_completed`.
- [ ] Add cancel control for active generation; user cancellation directly aborts the stream and removes the temporary assistant bubble.
- [ ] If cancellation happens before `user_message`, remove both temporary user and assistant bubbles and leave URL unchanged.
- [ ] If cancellation happens after `user_message`, remove the temporary assistant bubble and refetch the streamed session so the persisted user message remains.
- [ ] On error/cancel, reconcile by refetching persisted messages for the streamed session and clearing temporary final state.
- [ ] Add ChatPage-level component/integration tests for session-event URL switching, pre-`user_message` cancel removing both temporary bubbles, post-`user_message` cancel retaining refetched user message, and completion restoring citation/feedback controls.

Validation:

```bash
pnpm --filter @kb/web test
pnpm --filter @kb/web lint
pnpm --filter @kb/web typecheck
```

## Phase 7: Documentation And Full Checks

- [ ] Update README Chat API and RAG flow sections to describe SSE and fallback JSON route.
- [ ] Run targeted package checks.
- [ ] Run broader checks if targeted checks pass.

Validation:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Risk And Rollback Points

- Provider parser bugs can break streaming only; non-streaming `generate()` must stay unchanged.
- RAG shared helper extraction can accidentally change non-streaming behavior; keep regression tests around existing `submitQuestion`.
- API stream headers are committed before late failures; late errors must be event-shaped, not JSON envelopes.
- Browser abort may close the response before an `error` event is delivered; backend cleanup cannot depend on successful event delivery.
- Event ids are not replay cursors in the SSE MVP; adding replay would require explicit idempotency and persisted event log design.
- Retrieval runs have no `cancelled` status; cancellation before retrieval completion must use `failed` with safe cancellation metadata.
- Provider failure before and after first delta have different persistence rules; tests must cover both to avoid saving partial answers.
- Provider `[DONE]` or iterator completion is the persistence boundary; delivery failure after final persistence starts must not discard the completed assistant message/citations.
- Raw fetch must distinguish pre-stream JSON errors from malformed SSE to avoid showing generic parser failures for safe API validation/auth errors.
- Missing requestId or event id in stream events will weaken debugging; event schema and API tests must enforce trace fields.
- Frontend temporary message state can drift from persisted messages; always invalidate/refetch on completion, error, and cancel.
- Rollback is switching `ChatPage` back to `useSubmitChatQuestion` while leaving unused streaming code in place.
