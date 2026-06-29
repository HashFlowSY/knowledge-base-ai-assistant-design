# SSE 流式聊天输出

## Goal

把当前 `/chat` 的一次性 RAG 回答改造成 SSE 流式输出，让用户在检索完成后可以看到模型回答逐步出现，同时保留现有非流式接口作为兼容和回退路径。

用户价值：

- 降低长回答的等待感。
- 在模型仍在生成时展示进度和部分回答。
- 保持现有会话、引用、反馈和知识库权限模型不退化。

## Confirmed Facts

- 当前 `/chat` 使用单知识库、非流式 RAG 请求。
- 前端通过 TanStack Query 和 typed Hono RPC client 调用 `POST /api/chat/messages`。
- 前端当前在非流式 mutation 成功后更新 URL 中的 `sessionId`，再通过持久化消息查询渲染对话。
- 后端当前在一次请求内完成知识库授权、会话创建/读取、用户消息落库、检索、rerank、上下文组装、chat provider 生成、助手消息/引用落库，然后一次性返回 `session`、`userMessage`、`assistantMessage`。
- Chat provider 当前调用 OpenAI-compatible `/chat/completions`，请求体为 `stream: false`。
- `src/packages/rag` 拥有检索、融合、rerank、引用组装、反馈记录；`src/packages/ai-providers` 拥有 provider 适配、密钥解密、错误归一化；`src/apps/api` 只做 HTTP 适配。
- `retrieval_run_status` 当前只有 `running`、`completed`、`failed`，没有 `cancelled` 状态。

## Requirements

- 使用 SSE 作为流式协议；不引入 WebSocket。
- 新增流式提交路径 `POST /api/chat/messages/stream`，不破坏现有 `POST /api/chat/messages` 非流式接口。
- 流式路径必须复用现有登录态、tenant、知识库授权、会话归属校验、mutation guard 和限流策略。
- Provider 层必须支持 OpenAI-compatible streaming chat response，并把上游 provider 事件归一化为项目内部 token/delta 事件。
- RAG 层必须在流式输出时保留当前检索、融合、rerank、上下文预算、引用、依据标签和消息持久化语义。
- 前端必须在提交后显示临时用户消息和临时助手消息，按 SSE delta 逐步追加内容，最终用服务端持久化的助手消息替换临时消息。
- 流式 UI 的浏览器 stream reader、临时消息、取消状态和本地阶段状态由 `src/apps/web` 管理，不进入 React Context 或 localStorage。
- 前端必须区分至少两个阶段：检索/准备中、生成中。
- 新建会话的流式提交收到 `session` 事件后必须立即把 URL/选中会话切换到该 session，并清空 `citationId`；取消或错误后必须按该 session refetch，避免临时消息挂到错误会话。
- 流式完成后，聊天会话列表和当前会话消息缓存必须与服务端持久化结果一致。
- 错误必须以安全中文提示展示，不泄露 provider raw body、prompt、chunk 全文、密钥或堆栈。
- 支持用户取消当前生成；用户主动取消时前端直接 abort 当前 stream，移除临时 assistant bubble，不显示最终“已取消”助手消息。
- 如果取消发生在 `user_message` 事件前，前端必须移除临时 user bubble 和临时 assistant bubble，URL 保持原选中会话不变；如果取消发生在 `user_message` 事件后，则以服务端 refetch 结果为准保留已落库用户消息。
- Provider 未完成或被 abort 时，不持久化已经生成但尚未完成的部分助手回答。
- Provider stream 收到 OpenAI-compatible `[DONE]` 或内部 provider iterator 正常结束后，视为 provider 已完整生成；进入最终落库阶段后，即使客户端断连或 `answer_completed` 未送达，也必须持久化最终助手消息、引用、依据标签和相关 retrieval 数据；前端通过 refetch 对齐。
- 如果取消前 user message 已持久化，则保留该用户消息；前端以取消后的会话消息 refetch 结果为准。
- 浏览器取消或断连必须传播到 API、RAG 和 provider；provider 请求和 response body reader 必须收到同一个取消信号并尽快中止。
- 如果取消或断连发生在 retrieval run 仍为 `running` 时，必须用现有 `failed` 状态收尾，并写入安全错误码/消息；如果 retrieval run 已经 `completed`，不再回写 retrieval run。
- stream-time provider 失败必须区分：尚未发送任何 `answer_delta` 时，保持非流式行为，持久化一条“模型服务暂时不可用，请稍后重试。”助手消息并发送 `answer_completed`；已经发送过 `answer_delta` 后失败时，只发送安全 `error` 事件，不持久化部分回答或 fallback 助手消息。
- SSE 事件必须携带可追踪字段：`requestId`、稳定递增 event id，以及在可用时携带 `sessionId`、`userMessageId`、`assistantMessageId`、`retrievalRunId`。
- SSE frame 合同为 `id: <requestId>:<sequence>`、`event: <event-name>`、`data: <json>`；MVP 不支持 `Last-Event-ID` 自动重连或事件回放，event id 仅用于排序、关联日志和调试。
- 自动化测试不得调用真实外部 provider。

## Out of Scope

- 不把聊天协议改成 WebSocket。
- 不实现多知识库聊天。
- 不实现 query rewrite 或历史对话增强 prompt。
- 不新增 provider 配置 UI 能力。
- 不改数据库 schema，除非实现过程中发现当前消息状态无法满足最低持久化语义。
- 不默认持久化 provider 原始响应、prompt 或完整检索上下文到日志。

## Acceptance Criteria

- [ ] `POST /api/chat/messages` 仍可按原 JSON 合约完成非流式问答。
- [ ] `POST /api/chat/messages/stream` 可返回 `text/event-stream`，SSE frame 使用 `id: <requestId>:<sequence>`、`event:` 和 `data:`，事件包含阶段、增量回答、完成结果、错误形态、`requestId` 和稳定递增 event id。
- [ ] MVP 不实现 `Last-Event-ID` 自动重连或事件回放；断线后前端通过普通消息 refetch 对齐状态，而不是 replay SSE 事件。
- [ ] 成功有回答分支的 SSE 事件顺序可测试为 `session -> user_message -> retrieval_started -> retrieval_completed -> answer_delta* -> answer_completed`。
- [ ] no-answer 分支的 SSE 事件顺序可测试为 `session -> user_message -> retrieval_started -> retrieval_completed -> answer_completed`，且不发送 `answer_delta`。
- [ ] retrieval 失败、首个 delta 后的 provider 失败、以及其他 stream-time error 必须发送安全 `error` 事件；首个 delta 前的 provider 失败走 fallback `answer_completed` 分支；如果错误发生在 HTTP stream 开始前，则仍沿用现有 JSON 错误 envelope。
- [ ] 前端 raw `fetch` 遇到非 2xx 或响应 `Content-Type` 不是 `text/event-stream` 时，必须解析现有安全 JSON 错误 envelope 并展示中文错误提示，不能把它当作 SSE 解析失败。
- [ ] 流式接口在未登录、无权限、无效 body、会话不属于知识库、限流等场景下沿用现有安全错误语义。
- [ ] Provider streaming parser 能正确解析 OpenAI-compatible SSE delta、`[DONE]`、空 delta、非 2xx、畸形 JSON 和中断场景。
- [ ] Browser abort 或 HTTP 断连会传递到 RAG/provider，provider fetch/body reader 被取消；已开始且仍为 `running` 的 retrieval run 用 `failed` 和安全取消错误码收尾。
- [ ] RAG 流式服务在有引用时边生成边发送 delta，完成后持久化助手消息、引用和依据标签。
- [ ] RAG 流式服务在无引用时返回“未找到依据”结果，并保持当前 no-answer 行为。
- [ ] Provider 在首个 delta 前失败时持久化模型不可用 fallback 助手消息；首个 delta 后失败且 provider 未完整生成时不持久化 partial/fallback 助手消息。
- [ ] Provider stream 收到 `[DONE]` 或 provider iterator 正常结束后、发送 `answer_completed` 前发生客户端断连时，后端仍持久化最终助手消息、引用和依据标签；前端 refetch 后能看到最终回答。
- [ ] 前端提交问题后不等待完整响应即可展示临时 assistant bubble，并随着 delta 更新。
- [ ] 前端收到 `session` 事件后立即切换 URL/选中会话；完成、取消或错误后按该 session refetch messages 并刷新 sessions。
- [ ] 前端完成后可正常显示引用面板和反馈入口。
- [ ] `user_message` 事件前取消会移除临时 user/assistant bubbles 且 URL 不切换；`user_message` 事件后取消会移除临时 assistant bubble，并以服务端 refetch 结果保留已落库 user message。
- [ ] 前端取消/断连/错误后不会持久化部分助手回答；用户主动取消会移除临时 assistant bubble，不显示最终“已取消”助手消息，并以服务端 refetch 结果为准。
- [ ] ChatPage 级别组件/集成测试覆盖：`session` 事件切换 URL/选中会话、`user_message` 前取消移除临时 user/assistant、`user_message` 后取消保留 refetch 得到的用户消息、完成后引用面板和反馈入口恢复可用。
- [ ] 相关单元测试、API 路由测试、前端 hook/解析测试和 ChatPage 级别测试通过。

## Resolved Decisions

- Provider 未完成或被 abort 时，不持久化已经生成的部分回答。用户主动取消时前端直接 abort stream，移除临时 assistant bubble，不显示最终“已取消”助手消息，并重新拉取服务端持久化消息。
- Provider stream 收到 `[DONE]` 或 provider iterator 正常结束并进入最终落库阶段后，即使客户端没有收到最终 SSE 事件，也持久化最终助手消息、引用和依据标签。
- 如果取消前 user message 已经落库，则保留该用户消息；UI 不伪造或补写取消态助手消息。
- 取消或断连复用现有 `retrieval_runs.status = "failed"`，不为 SSE MVP 新增 `cancelled` 数据库状态。
- MVP 不支持 SSE 自动重连和事件回放；event id 只用于排序与追踪。

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
