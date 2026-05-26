# 用户对话页面开发

## Goal

完成面向最终用户的知识库对话页面，并把页面从现有 mock 问答体验推进到真实 RAG 查询链路。用户应能在授权知识库范围内发起问题，系统基于知识库上下文生成带引用的答案，并在没有可靠依据时明确告知知识库中没有找到可支撑答案。

## What I Already Know

- 当前已完成文档上传、解析、分块、embedding 和索引相关能力。
- 当前已有问答模型、embedding 模型、rerank 模型的配置入口。
- 用户已确认本任务选择“完整 MVP 闭环”范围：页面、API、RAG 编排、引用、反馈都要能真实运行。
- 用户允许当前功能不做审计；本任务不要求新增审计事件或审计列表能力。
- 用户已确认 v1 当前只做单知识库问答：选择对应知识库后，在该知识库范围内进行问答操作。
- 用户已确认 v1 使用单次 HTTP 请求返回完整答案：前端显示检索/生成中的等待状态，后端完成 RAG 和 LLM 后一次性返回答案、引用、置信度/无答案状态。
- 用户已确认 v1 置信度展示使用定性依据标签，不展示百分比数字。
- 用户已确认 v1 保持三栏工作台布局：左侧会话列表，中间问答消息流，右侧引用核验与反馈。
- 用户已确认无答案策略按推荐实现：能回答有依据的部分时回答并明确标出缺失；完全没有依据时明确说知识库中没有找到。
- 用户已确认支持同一会话内的多轮追问，并固定使用最近 3 轮历史。一轮定义为 1 条用户问题 + 1 条助手回答，最多取最近 6 条历史消息。
- 用户已确认 v1 会话管理只做创建和选择；会话标题由首个问题自动生成，不做重命名和删除。
- 用户已确认 v1 检索参数：向量检索 top 30、关键词检索 top 30、融合候选 top 50、rerank 后 top 8、上下文最多使用 top 8 chunks。
- 用户已确认 v1 融合策略使用 RRF（Reciprocal Rank Fusion），按 `chunkId` 去重，保留两路 rank/score 和最终 `fusedScore`。
- 用户已确认 v1 上下文组装策略：最多 6,000 估算 tokens，最多使用 rerank top 8 chunks，只合并同一文档中 `chunkIndex` 连续的相邻 chunk，超预算时按 rerank 顺序截断。
- 用户强制要求开发必须按照 `.trellis/spec/` 内描述的开发规范进行，且单文件行数限制在 300-350 行范围内。
- 目标查询流程：
  - 用户问题
  - 查询理解
  - query rewrite / query expansion
  - 多路召回：向量检索、全文关键词检索、元数据过滤
  - 结果融合
  - rerank 重排序
  - 上下文组装
  - LLM 生成答案
  - 引用来源 / 置信度 / 无答案处理
- 查询理解层需要处理原始问题、历史对话、知识库范围、权限、语言、是否多轮追问。
- 查询改写层需要保留原始 query，避免丢掉关键字、字段名、函数名。
- 召回层必须同时覆盖向量检索和全文检索。
- 融合层可用 RRF 或简单加权，必须合并、去重、打分。
- 重排序层需要从较大的候选集里挑选最终上下文 chunks。
- 上下文组装需要控制 token 预算，合并相邻 chunk，并保留标题、文件名、页码、chunk 顺序。
- 生成层要求 LLM 只能基于上下文回答，答案必须带引用，没有依据时明确说明知识库中没有找到。
- 用户明确要求开发前详细阅读相关 spec，禁止未读 spec 开发，单文件行数控制在约 300-400 行。

## Repo Context

- 项目是 pnpm workspace + TypeScript strict monorepo。
- `README.md` 明确当前聊天问答、完整 RAG 回答生成仍待实现。
- 前端现有聊天入口：
  - `src/apps/web/src/app/chat/page.tsx`
  - `src/apps/web/src/features/chat/chat-page.tsx`
  - `src/apps/web/src/features/chat/chat-layout.ts`
  - `src/apps/web/src/copy/chat.ts`
- 当前聊天页由 `MockDataBoundary` 和 `useMockStore` 驱动，提交问题只写入 mock state，不调用真实 API。
- 现有聊天 UI 已包含会话列表、消息区、引用核验面板、反馈入口、生成状态和错误/无引用状态的 mock 展示。
- 前端已有 typed Hono client 与 API helper：
  - `src/apps/web/src/features/api/client.ts`
- 后端已有 RAG 相关数据库表：
  - `chat_sessions`
  - `chat_messages`
  - `retrieval_runs`
  - `retrieval_results`
  - `answer_citations`
  - `answer_feedback`
- `src/packages/rag/src/index.ts` 目前主要是候选和引用契约，尚未实现完整查询编排。
- `src/packages/search/src/index.ts` 目前提供 Meilisearch 索引写入和授权搜索范围契约，尚未看到查询读取器。
- `src/packages/ai-providers/src/service.ts` 已实现 Provider 配置和 embedding 调用；目前未看到完整 chat generation service 与 rerank service 对外接口。
- `src/apps/api/src/contracts/rpc.ts` 目前没有 chat/RAG API route schema。
- `src/apps/api/src/app.ts` 目前未挂载 chat/RAG router。

## Specs Read So Far

- `.trellis/spec/frontend/index.md`
- `.trellis/spec/frontend/component-guidelines.md`
- `.trellis/spec/frontend/state-management.md`
- `.trellis/spec/frontend/hook-guidelines.md`
- `.trellis/spec/frontend/copywriting.md`
- `.trellis/spec/frontend/quality-guidelines.md`
- `.trellis/spec/backend/index.md`
- `.trellis/spec/backend/api-module.md`
- `.trellis/spec/backend/api-contract.md`
- `.trellis/spec/backend/package-boundaries.md`
- `.trellis/spec/backend/rag-ingestion.md`
- `.trellis/spec/backend/ai-provider.md`
- `.trellis/spec/backend/database.md`
- `.trellis/spec/backend/security.md`
- `.trellis/spec/backend/performance.md`
- `.trellis/spec/backend/observability.md`
- `.trellis/spec/backend/logging.md`
- `.trellis/spec/shared/typescript.md`
- `.trellis/spec/shared/code-quality.md`
- `.trellis/spec/testing/strategy.md`
- `.trellis/spec/guides/index.md`

## Spec Constraints

- Frontend production pages integrated with real APIs must not import `src/apps/web/src/features/mock/*`.
- Server state must use feature-scoped TanStack Query hooks, not React Context or localStorage.
- Internal API calls should use the typed Hono RPC client when possible.
- UI copy must be centralized under feature/shared copy files and use concise enterprise Chinese.
- API endpoints must validate path/query/body with Zod and return standard `ApiSuccessResponse` / `ApiErrorResponse` envelopes.
- Chat/RAG routes must be authenticated and must enforce tenant and knowledge-base authorization before retrieval.
- Domain behavior belongs in `src/packages/*`; API handlers stay thin.
- `src/packages/rag` owns query-time retrieval, fusion, rerank, citation assembly, and feedback recording.
- `src/packages/ai-providers` owns provider calls for chat, embedding, and rerank; RAG must not call vendor SDKs directly.
- Retrieval must apply tenant and knowledge-base filters before results are returned to application code.
- Rerank candidate count must be bounded; if rerank is unavailable, fallback to fused scores is allowed but must log the fallback.
- Final answers must include citations when knowledge context is used.
- Feedback must persist rating, optional reason, message id, retrieval run id, citation ids, actor id, and tenant id.
- User confirmed audit is not required for this feature; do not add audit as a hard acceptance condition for this task.
- Logs and errors must not include provider keys, raw prompt content, full chunk content, or full model responses.
- Relevant quality gates include `pnpm typecheck`, `pnpm lint`, `pnpm test`, and targeted package/web/API tests.
- Before implementation, the developer must load `trellis-before-dev` and reread the relevant `.trellis/spec/` documents for every touched layer. Implementation must follow those specs; if a requirement conflicts with a spec, stop and update the PRD or spec decision instead of coding through ambiguity.

## Requirements (Evolving)

- Replace the mock chat page data path with real API-backed chat sessions, messages, citations, and feedback.
- Add or expose a chat/RAG API contract for starting or continuing a session and submitting a user question.
- Implement the backend RAG query path needed by the page:
  - resolve actor and tenant
  - validate selected knowledge bases and authorization
  - preserve original query
  - derive rewritten/expanded query when useful
  - run vector retrieval
  - run keyword retrieval
  - apply metadata and authorization filters
  - fuse and deduplicate candidates
  - rerank bounded candidates
  - assemble context with citation metadata
  - generate grounded answer with citations
  - handle no-answer and provider failure states
  - persist chat messages, retrieval run, retrieval results, citations, and feedback
- The UI should display:
  - available knowledge bases and the selected single knowledge-base scope
  - session history
  - message lifecycle states
  - answer text
  - citation list and citation detail
  - confidence or confidence-like grounding signal
  - no-answer state
  - retry or failure state
  - answer feedback
- Keep implementation files focused and avoid files growing past roughly 300-400 lines; split by domain when needed.
- Hard file-size constraint: implementation source files should be split before they exceed 300 lines and must not exceed 350 lines. If a touched source file is already above the limit, this task must not make it larger; extract focused modules instead. Generated files, lockfiles, and migration snapshots are exempt only when tool-generated.
- Do not implement audit recording for chat events in this task unless it is already required by an existing shared helper path. Logging and safe error handling still apply.
- v1 chat session must bind to exactly one selected knowledge base. API input should accept one `knowledgeBaseId`; database persistence may continue writing the existing `selectedKnowledgeBaseIds` array with one item for compatibility.
- v1 answer generation uses a non-streaming request/response contract. Do not add SSE, WebSocket, token streaming, or async polling in this task.
- Confidence display should use qualitative grounding labels such as `依据充分`, `依据有限`, and `未找到依据`, derived from rerank/retrieval/citation signals rather than exposed as a numeric percentage.
- Keep the current three-column workspace layout as the v1 product structure. The implementation may refactor components, but the page should still expose session navigation, conversation, and citation verification as separate desktop columns.
- No-answer behavior should be evidence-first:
  - if retrieved context supports part of the question, answer only the supported part and state what was not found in the knowledge base;
  - if no retrieved context can support an answer, return a clear no-answer response instead of guessing.
- Follow-up questions in the same chat session should use the most recent 3 conversation turns for query understanding and rewrite while keeping retrieval scoped to the selected single knowledge base. A turn means one user message plus one assistant answer; the current original query must still be preserved and included in retrieval.
- Session management for v1 includes creating and selecting sessions only. Session title should be generated from the first user question. Rename and delete actions are out of scope.
- Retrieval defaults for v1 are fixed:
  - vector retrieval: top 30
  - keyword retrieval: top 30
  - fused candidates: top 50
  - reranked results: top 8
  - assembled context: at most top 8 chunks
- Fusion must use RRF for vector and keyword retrieval results because source score scales are not comparable. Deduplicate by `chunkId`; preserve `vectorRank`, `vectorScore`, `keywordRank`, `keywordScore`, and `fusedScore`. If a source provides scores without ranks, sort that source by score first to derive ranks before RRF.
- Context assembly defaults for v1:
  - maximum context budget: 6,000 estimated tokens
  - input candidates: reranked top 8 chunks
  - merge only chunks from the same document where `chunkIndex` values are immediately adjacent
  - preserve source title/file name, locator, chunk order, and citation mapping
  - when over budget, truncate by rerank order without reordering citations
- If rerank is unavailable, fall back to fused ranking, mark the grounding label no higher than `依据有限`, and log a safe structured event without raw prompt or chunk content.

## Acceptance Criteria (Evolving)

- [ ] `/chat` no longer uses `MockDataBoundary`, `useMockStore`, or mock business entity types in production code.
- [ ] User can create/select a chat session scoped to authorized knowledge base(s).
- [ ] User can choose one authorized knowledge base and create/select chat sessions within that knowledge base.
- [ ] New session title is generated from the first user question.
- [ ] User can submit a question and receive a persisted assistant answer.
- [ ] Submit-question API returns the complete answer payload in one response after retrieval, rerank, context assembly, and LLM generation finish.
- [ ] Generated answers are grounded in retrieved context and include citation metadata.
- [ ] Assistant answers expose a qualitative grounding label instead of a numeric confidence percentage.
- [ ] No-answer responses clearly state that the knowledge base did not contain supporting material.
- [ ] Partial-answer responses separate supported content from missing/unsupported content.
- [ ] Follow-up questions use at most the most recent 3 conversation turns, defined as up to 6 prior messages, for query understanding and rewrite.
- [ ] Retrieval uses vector top 30 and keyword top 30, fuses candidates to top 50, reranks to top 8, and assembles context from at most top 8 chunks.
- [ ] Fusion uses RRF, deduplicates by `chunkId`, and preserves source rank/score metadata.
- [ ] Context assembly caps content at 6,000 estimated tokens, merges only immediately adjacent chunks from the same document, and preserves citation mapping.
- [ ] Rerank provider failure falls back to fused ranking with a safe user-visible status and no raw prompt/chunk logging.
- [ ] Citation panel displays source title, locator/page/chunk information, snippet, and rank/order.
- [ ] Desktop `/chat` keeps a three-column workspace: sessions, conversation, citation verification/feedback.
- [ ] Feedback submission persists through a real API and updates/invalidates affected queries.
- [ ] Unauthorized knowledge-base access is rejected server-side and represented in the UI.
- [ ] Provider, retrieval, validation, and authorization failures map to safe user-facing messages.
- [ ] Unit tests cover query rewrite preservation, fusion/deduplication, rerank fallback, citation assembly, no-answer handling, and API error mapping.
- [ ] Frontend tests cover loading, empty, error, unauthorized/forbidden, answer-with-citation, no-answer, and feedback states.
- [ ] Implementation follows all relevant `.trellis/spec/` documents loaded before development.
- [ ] No non-generated implementation source file introduced or modified by this task exceeds 350 lines; files approaching 300 lines are split into focused modules.
- [ ] Relevant lint, typecheck, and tests pass.

## Decisions

- Scope boundary: implement the complete MVP loop in this task, not only a frontend shell or backend-only RAG package.
- Audit: no new audit requirement for this task. Chat sessions, messages, retrieval runs, retrieval results, citations, and answer feedback still persist as business data.
- Knowledge-base scope: v1 supports single-knowledge-base Q&A only. Multi-knowledge-base chat is out of scope.
- Answer delivery mode: v1 uses one HTTP request that returns the complete answer, citations, and status. Async polling and streaming are out of scope.
- Confidence display: v1 uses qualitative grounding labels (`依据充分`, `依据有限`, `未找到依据`) rather than numeric percentages.
- Page layout: v1 keeps the current three-column workspace layout.
- No-answer behavior: answer supported parts only, explicitly mark missing parts, and refuse when there is no supporting context.
- Multi-turn behavior: support same-session follow-up questions using the most recent 3 conversation turns, where one turn is one user question plus one assistant answer.
- Session management: v1 supports only create/select sessions. Rename and delete are out of scope.
- Retrieval defaults: vector top 30, keyword top 30, fused top 50, rerank top 8, context top 8 chunks.
- Fusion strategy: use RRF for vector/keyword result fusion, with score-sorted derived ranks when explicit ranks are unavailable.
- Context assembly: cap at 6,000 estimated tokens, use top 8 reranked chunks, merge same-document adjacent chunks only, truncate by rerank order.
- Development constraints: relevant `.trellis/spec/` docs are mandatory, and implementation source files must stay at or below 350 lines with a split target around 300 lines.

## Open Questions

- Final design approval: confirm the PRD decisions are sufficient to start implementation.

## Assumptions (Temporary)

- This task is cross-layer and likely touches `src/apps/web`, `src/apps/api`, `src/packages/rag`, `src/packages/ai-providers`, `src/packages/search`, and `src/packages/db`.
- The existing database schema is intended to support chat persistence and retrieval run tracking without a major schema redesign.
- Production v1 should use DeepSeek for chat and Tongyi/Bailian for embedding/rerank through the existing Provider config model.
- A first usable version should prioritize correctness, authorization, citations, and no-answer behavior over streaming responses.
- Streaming token-by-token answers are out of scope unless the user later explicitly reopens that decision.

## Out Of Scope (Draft)

- URL ingestion implementation.
- Full document browsing/detail redesign.
- Admin audit/log list integration beyond chat feedback/retrieval events required by this task.
- New audit event recording for chat, retrieval, citation, or feedback actions.
- Multi-knowledge-base chat selection and cross-knowledge-base answer synthesis.
- Multi-tenant enterprise administration beyond existing tenant scoping.
- Streaming token-by-token answer delivery.
- Async job + polling answer delivery.
- Numeric confidence percentage display.
- Chat session rename and delete actions.

## Technical Notes

- Existing chat page is already visually close to the target but must be reworked around API hooks and real contracts.
- Existing search package writes Meilisearch documents with filterable `tenantId`, `knowledgeBaseId`, `documentId`, and `chunkId`; query-time keyword search API is still to be designed/implemented.
- Existing ai-provider service has embedding service and provider connection tests; chat/rerank runtime services may need to be added to match the spec interfaces.
- Existing RAG package is small and should likely grow through focused files instead of putting the entire pipeline into `index.ts`.
- Before implementation, read the relevant specs again via `trellis-before-dev` and keep task context aligned with this PRD.
