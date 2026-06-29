# SSE 流式聊天输出 Design

## Architecture

保留当前非流式链路作为兼容路径：

```text
web -> POST /api/chat/messages -> api chat procedure
  -> rag.submitQuestion -> provider.generate(stream: false)
  -> persisted user/assistant messages -> JSON response
```

新增 SSE 流式链路：

```text
web fetch(POST /api/chat/messages/stream)
  -> api chat stream procedure
  -> rag.streamQuestion async event stream with AbortSignal
  -> provider.streamChat(OpenAI-compatible SSE with AbortSignal)
  -> api serializes project SSE events
  -> web reads ReadableStream and updates temporary message state
```

`src/packages/ai-providers` owns upstream provider streaming parsing and normalized provider errors.

`src/packages/rag` owns the RAG workflow, event ordering, message persistence, citations, and grounding labels.

`src/apps/api` owns HTTP headers, request/body/auth middleware, SSE serialization, and error-to-event mapping after headers have been sent.

`src/apps/web` owns the browser stream reader, temporary assistant message, cancellation, cache invalidation, and rendering states.

## Event Contract

Use standard SSE frames:

```text
id: <requestId>:<sequence>
event: <event-name>
data: <json>

```

Initial event set:

| Event | Purpose |
| --- | --- |
| `session` | Emitted after session is created or loaded; includes session summary. |
| `user_message` | Emitted after the user message is persisted. |
| `retrieval_started` | Emitted before vector/keyword retrieval begins. |
| `retrieval_completed` | Emitted after retrieval results and citations are known; includes `groundingLabel` and citation count, not full chunk content. |
| `answer_delta` | Emitted for each normalized chat provider text delta. |
| `answer_completed` | Emitted after assistant message, citations, and grounding label are persisted; includes the final `assistantMessage` and updated `session`. |
| `error` | Emitted for safe stream-time failures after the stream response has started. |

The contract should live in `@kb/rag` as Zod schemas and inferred types so API and web do not redefine event shapes.

Every event frame uses a stable monotonic event id in the form `<requestId>:<sequence>`, starting at `1` per stream. Every payload includes `requestId`. Payloads include message/session/retrieval ids as soon as those ids exist. The SSE MVP does not support `Last-Event-ID`, automatic reconnect, or event replay; event ids are only for ordering, log correlation, and debugging. Reconnection reconciles through normal session/message refetch.

Minimum payload contract:

- `session`: `{ requestId: string; session: ChatSessionSummary }`
- `user_message`: `{ requestId: string; sessionId: string; userMessage: ChatMessage }`
- `retrieval_started`: `{ requestId: string; retrievalRunId: string; sessionId: string; userMessageId: string }`
- `retrieval_completed`: `{ requestId: string; retrievalRunId: string; sessionId: string; userMessageId: string; groundingLabel: GroundingLabel; citationCount: number }`
- `answer_delta`: `{ requestId: string; delta: string; retrievalRunId: string; sessionId: string; userMessageId: string }`
- `answer_completed`: `{ requestId: string; session: ChatSessionSummary; assistantMessage: ChatMessage }`
- `error`: `{ requestId: string; code: string; message: string; retryable?: boolean; assistantMessageId?: string; retrievalRunId?: string; sessionId?: string; userMessageId?: string }`

Required event ordering:

- Successful grounded answer: `session -> user_message -> retrieval_started -> retrieval_completed -> answer_delta* -> answer_completed`
- No-answer result: `session -> user_message -> retrieval_started -> retrieval_completed -> answer_completed`
- Retrieval failure after the stream starts: `session -> user_message -> retrieval_started -> error`
- Provider failure before any delta: `session -> user_message -> retrieval_started -> retrieval_completed -> answer_completed` with the model-unavailable fallback assistant message.
- Provider failure after one or more deltas: `session -> user_message -> retrieval_started -> retrieval_completed -> answer_delta+ -> error`
- Cancellation or HTTP disconnect may prevent the client from receiving a final `error` event; backend cleanup still applies.
- If provider generation completed and final persistence starts, stream delivery failure may prevent `answer_completed` from reaching the client, but the assistant message and citations are still persisted.

## RAG Workflow

The streaming path should share most of the existing `submitQuestion` workflow:

1. Trim and validate question via existing input schema.
2. Authorize knowledge base.
3. Create or load session.
4. Append user message.
5. Start retrieval run.
6. Emit `session`, `user_message`, and `retrieval_started`.
7. Run embedding, keyword search, fusion, rerank, context assembly, and retrieval result recording.
8. Complete retrieval run and emit `retrieval_completed`.
9. If no citations exist, append and emit the existing no-answer assistant message.
10. If citations exist, call streaming chat provider with the request abort signal, emit `answer_delta` chunks, and accumulate full text.
11. When provider streaming receives OpenAI-compatible `[DONE]` or the internal provider iterator completes normally, enter final persistence. From this point, persist the final assistant message and citations even if the client disconnects before receiving `answer_completed`.
12. Emit `answer_completed` when the client is still connected.

The non-streaming path can keep its public behavior while internally sharing helper functions with the streaming path where that reduces duplication.

RAG cancellation handling:

- `streamQuestion` accepts an `AbortSignal` from the API layer and checks it before each expensive boundary: session/message persistence, retrieval, rerank, provider stream start, and each provider delta.
- If the signal aborts before a retrieval run exists, no retrieval run cleanup is required.
- If the signal aborts while the retrieval run is still `running`, complete the run with `status: "failed"`, `errorCode: "client_aborted"`, and a safe Chinese message such as `请求已取消。`.
- If the signal aborts after `retrieval_completed` has been emitted and the retrieval run is already `completed` but before provider completion, do not rewrite the retrieval run. Do not append an assistant message.
- If the signal aborts after provider completion and final persistence has started, finish persisting the assistant message, citations, and grounding label even if `answer_completed` cannot be delivered.
- Cancellation and disconnects do not introduce a new database enum value in the SSE MVP.

Provider failure handling:

- Provider failure before the first `answer_delta` preserves non-streaming behavior: append an assistant message with `模型服务暂时不可用，请稍后重试。`, preserve citations/grounding label, and emit `answer_completed`.
- Provider failure after at least one `answer_delta` emits a safe `error` event and does not append any assistant message. The already-streamed text remains UI-temporary only.
- Client cancellation is not treated as provider failure and never appends the fallback assistant message.
- Provider normal completion followed by stream delivery failure is not treated as cancellation of persistence. The final persisted answer is authoritative and the frontend reconciles through refetch.

## Provider Streaming

`ProviderChatService` should gain a streaming method rather than changing `generate`:

```typescript
stream(input): AsyncIterable<
  | { type: "delta"; text: string }
  | { type: "done" }
>
```

The input includes an optional caller signal:

```typescript
{
  messages: { role: "system" | "user" | "assistant"; content: string }[];
  requestId: string;
  signal?: AbortSignal;
  tenantId: string;
}
```

The OpenAI-compatible request uses `stream: true`. The parser reads `response.body`, decodes UTF-8 incrementally, handles SSE line framing, ignores comments/empty lines, parses `data: ...`, extracts `choices[0].delta.content`, and stops on `[DONE]`.

Provider failures must map to existing normalized provider error codes. Raw upstream response bodies are not exposed to API clients or logs.

The provider adapter must combine the caller `AbortSignal` with its internal timeout. External aborts stop the upstream `fetch` and body reader; timeout aborts still map to `PROVIDER_TIMEOUT`.

## API Streaming

Add `POST /api/chat/messages/stream` under the chat router with the same middleware shape as `POST /api/chat/messages`:

```text
jsonMutationGuard -> requireSession -> createJsonBodyValidationMiddleware -> stream procedure
```

Before returning the streaming response, body validation and auth must have completed. After headers are sent, any later failure should be serialized as an `error` event with a safe message and then close the stream when the client is still connected.

Use standard `ReadableStream` to serialize SSE events instead of depending on a framework-specific helper.

The API procedure passes `context.req.raw.signal` into `chatService.streamQuestion`. The same signal reaches RAG and provider code so browser `AbortController.abort()` and HTTP disconnects stop expensive provider work.

Required headers:

- `Content-Type: text/event-stream; charset=utf-8`
- `Cache-Control: no-cache, no-transform`
- `Connection: keep-alive`
- `X-Request-Id: <requestId>`

Pre-stream failures:

- If auth, mutation guard, body validation, permission checks, or rate limiting reject before the SSE response starts, the API keeps the existing JSON error envelope and status code.
- The frontend streaming hook must check `response.ok` and `Content-Type` before parsing SSE. Non-2xx or non-`text/event-stream` responses are parsed with the existing API error envelope schema and shown as safe Chinese errors.

## Frontend Streaming State

Keep TanStack Query for persisted sessions/messages. Add a feature-scoped streaming submit hook for this workflow, likely alongside existing chat hooks.

The hook should:

1. Validate body with `submitChatQuestionInputSchema`.
2. Use raw `fetch` because Hono RPC JSON helpers do not model incremental SSE reading.
3. Use `AbortController` for cancellation.
4. Parse SSE frames into `@kb/rag` event schemas.
5. Expose workflow state: `idle | retrieval | generating | completed | error | cancelled`.
6. Allow `ChatPage` to render a temporary user/assistant message before persisted query invalidation catches up.
7. Invalidate `["chat", "sessions"]` and the completed session's messages query when `answer_completed` arrives.

Temporary UI state must not be stored in React Context or localStorage.

Session and URL behavior:

- When `session` arrives, immediately update URL state to `knowledgeBaseId=<session.knowledgeBaseId>&sessionId=<session.id>` and clear `citationId`.
- Bind all temporary messages and stream state to that session id after the event arrives.
- On `answer_completed`, invalidate sessions and the completed session's messages query, then replace temporary assistant state with persisted data.
- On `error`, `cancelled`, or reader failure after a `session` event, invalidate sessions and refetch that session's messages before clearing temporary final state.
- If the stream fails before a `session` event, do not switch URL; clear temporary state against the previously selected session.
- If user cancellation happens before `user_message`, remove both temporary user and assistant bubbles because the server has not confirmed the user message was persisted.
- If user cancellation happens after `user_message`, remove the temporary assistant bubble and reconcile by refetching messages for that event's `sessionId`; the persisted user message remains visible after refetch.

## Cancellation And Partial Persistence

Provider-incomplete or aborted generations are not saved as final assistant messages in the SSE MVP. On user cancellation, the client aborts the stream, removes the temporary assistant bubble, and refetches persisted messages instead of rendering a final cancelled assistant message. The user message and retrieval run may already exist; the UI reconciles from `listMessages` after cancellation.

When a retrieval run is still `running`, cancellation/disconnect is recorded as `status: "failed"` with `errorCode: "client_aborted"`. When the retrieval run is already `completed`, cancellation before provider completion does not change the retrieval run and does not append an assistant message.

If the provider stream has received `[DONE]` or the internal provider iterator has completed normally and the RAG service has entered final persistence, delivery failure after that point does not discard the completed answer. The backend persists the assistant message, retrieval run, retrieval results, and citations to satisfy the streaming chat contract; the frontend refetches and renders the persisted answer if it missed `answer_completed`.

This avoids introducing a new database message status field or retrieval-run enum value in the SSE MVP.

## Compatibility And Rollback

Rollback path is simple because existing `POST /api/chat/messages` remains intact. If streaming has a production issue, the frontend can switch back to the non-streaming mutation while provider/RAG/API streaming code remains unused.

## Security And Observability

- Never stream full prompt, full chunk content, provider raw error body, or secrets.
- Stream event IDs may include request/session/message IDs but not raw API keys or prompt text.
- Preserve `requestId` across provider calls and stream headers.
- Use safe error mapping for stream-time errors.
