# Fix Chat KB Authorization Enforcement

## Goal

修复 chat 读取和反馈路径未重新校验当前知识库权限的问题。成员从某个知识库移除后，不能继续通过历史 chat session、message、citation 或 feedback 路径读取或操作该知识库相关内容。

## What I Already Know

- 触发问题来自 code review 的 High finding：Chat 读取/反馈路径只校验 session/message 归属，没有重新校验当前 KB 授权。
- 当前 API middleware 负责 session 解析、actor 注入、admin role 校验和 rate limit；它不按具体 `knowledgeBaseId` 做授权。
- `@kb/knowledge` 已有当前 KB 可见性规则：tenant + not deleted + admin all / member only assigned KB。
- `@kb/rag` 当前维护了另一份 KB membership SQL，并且只在 create session / submit question / filtered list sessions 路径使用。
- 当前重复逻辑不只是代码重复，而是安全规则重复：同一条“actor 是否能访问 KB”的规则分别出现在 `@kb/knowledge` 和 `@kb/rag`，chat read/feedback 又没有稳定复用任一入口，导致成员移除后权限状态漂移。
- 不能用“在某个 API procedure 里补一条检查”的打补丁方式修复；需要统一权限规则来源和 chat 访问路径。

## Duplicate Authorization Logic

当前 KB 权限相关逻辑有三类重复或近似重复，需要在本任务中收敛：

1. **KB 可见性 SQL 重复**
   - `src/packages/knowledge/src/service/queries.ts` 的 `createVisibleKnowledgeBaseConditions` 是当前最完整的规则来源：同租户、未删除、admin 全部可见、member 只能访问 `knowledge_base_members` 中分配的 KB。
   - `src/packages/rag/src/drizzle-runs.ts` 的 `actorCanAccessKnowledgeBase` 重新写了一份非常相似的 tenant/deleted/member SQL。
   - 风险：后续如果 `knowledge` 支持 visibility、角色粒度或 membership 状态变化，`rag` 很容易漏改。

2. **Actor 类型重复**
   - `src/packages/knowledge/src/service/types.ts` 的 `KnowledgeActor` 与 `src/packages/rag/src/service-types.ts` 的 `RagActor` 形状相同：`user.id`、`tenant.id`、`role`。
   - 风险：actor 结构或 role 枚举变更时，两个 package 可能漂移。

3. **Chat session/message 可访问条件重复且不完整**
   - `src/packages/rag/src/drizzle-repository.ts` 多处手写 tenant、session owner、deletedAt、selected KB 条件：`getSession`、`listMessages`、`listRecentMessages`、`listSessions`、`canAccessMessage`、`appendMessage`。
   - 这些条件目前主要证明“这个 session/message 属于当前用户”，没有统一证明“session 关联的 KB 当前仍对 actor 可见”。
   - 风险：某个 read/write 路径漏掉 current KB visibility，就会重新出现撤权后仍可读旧内容的问题。

统一修复要求：

- `@kb/knowledge` 应成为 KB 可见性/成员授权规则的唯一 owner。
- `@kb/rag` 可以保留 chat session 自身的存储条件，例如 `selectedKnowledgeBaseIds` 包含目标 KB，但不应复制 membership SQL。
- `@kb/rag` 内部应有单一 chat-access 查询 helper，被所有 session/message/feedback 路径复用。
- API procedure 不应新增局部授权补丁；API 只负责 HTTP concerns 和调用 package service。

## Requirements

- 所有 chat 入口必须基于当前 actor 权限执行 KB 授权：
  - `createSession` 和 `submitQuestion` 继续在使用目标 `knowledgeBaseId` 前校验当前 KB 权限。
  - `listSessions` 在没有 `knowledgeBaseId` query 时，只返回 actor 当前仍可访问的 session。
  - `listSessions` 在有 `knowledgeBaseId` query 时，先校验该 KB 当前可见，再只返回该 KB 的 session。
  - `listMessages` 必须从 session 反查 selected KB，并验证 actor 当前仍可访问后才返回 message/citation/feedback；如果失权，返回 `NOT_FOUND`。
  - `submitFeedback` 必须从 message -> session 反查 selected KB，并验证 actor 当前仍可访问后才写 feedback；如果失权，返回 `NOT_FOUND` 且不能写入。
- `@kb/rag` 不应继续拥有独立的 KB membership SQL 规则；它应复用 `@kb/knowledge` 暴露的 server-only 权限接口或共享条件构造。
- 保持 retrieval 后端的 tenant + knowledgeBaseId 过滤：pgvector 和 Meilisearch 仍必须使用经过授权的 KB id。
- 不把 domain 授权逻辑放到 API procedure 或 generic security utility。
- 保持 API error envelope 和现有 service error mapping。
- 增加覆盖成员权限撤销后的 chat read/feedback 测试。

## Acceptance Criteria

- [ ] member 被从 KB 移除后，`GET /api/chat/sessions` 不返回该 KB 的历史 session。
- [ ] member 被从 KB 移除后，`GET /api/chat/sessions/:sessionId/messages` 返回 `NOT_FOUND`，不返回该 session 的 messages/citations。
- [ ] member 被从 KB 移除后，`POST /api/chat/messages/:messageId/feedback` 返回 `NOT_FOUND`，且不写入 feedback。
- [ ] admin 仍可访问同租户内所有 KB 对应的 chat sessions/messages。
- [ ] member 对仍被授权的 KB 的 chat 行为不回归。
- [ ] `@kb/rag` 的 KB access rule 复用 `@kb/knowledge` 的权限规则来源，避免重复 SQL drift。
- [ ] `RagActor` / `KnowledgeActor` 的重复 shape 被消除或显式收敛到单一 owner，除非实现阶段发现 browser-safe export 边界不允许。
- [ ] `src/packages/rag/src/drizzle-repository.ts` 中 session/message/feedback 访问条件通过同一个内部 helper 表达，不再多处散落手写 current KB visibility。
- [ ] 测试覆盖 service/repository 层，而不只覆盖 API router mock delegation。

## Definition of Done

- Tests added/updated for the affected RAG authorization paths.
- Lint/typecheck pass for changed packages.
- No ad hoc API procedure patching; permission checks are centralized at the domain boundary.
- Relevant specs updated if the implementation introduces a new public server-only permission API.

## Technical Approach

Recommended direction:

1. Add or expose a narrow server-only permission surface from `@kb/knowledge/service`.
   - It should own the current KB visibility rule: tenant scope, not deleted, admin all, member assigned only.
   - It can expose a direct boolean helper and/or SQL condition builder that `@kb/rag` can use without importing internal files.
2. Make `@kb/rag` depend on that `@kb/knowledge` server-only permission surface.
   - Replace the duplicated `actorCanAccessKnowledgeBase` implementation in `src/packages/rag/src/drizzle-runs.ts`.
   - Prefer aliasing or reusing `KnowledgeActor` for `RagActor` shape if this does not create browser bundling issues.
3. In the RAG repository, define one internal helper for accessible chat sessions.
   - Conditions should include tenant, session owner, not deleted, selected KB match when relevant, and current KB visibility.
   - Reuse it in list sessions, get session, list messages, list recent messages, message access, and feedback write paths.
4. Keep API procedures thin.
   - API routes should validate request shape, read actor, and call chat service.
   - Domain authorization should remain in RAG/knowledge package boundaries.

## Decision (ADR-lite)

**Context**: 用户可能持有历史 chat session/message id。成员被移出 KB 后，如果 read/feedback 路径返回 `FORBIDDEN`，会暴露该 session/message 仍存在且只是失权。

**Decision**: 对历史资源 by-id 路径使用安全的 `NOT_FOUND`：

- `GET /api/chat/sessions/:sessionId/messages` 在 session 关联 KB 已失权时返回 `NOT_FOUND`。
- `POST /api/chat/messages/:messageId/feedback` 在 message/session 关联 KB 已失权时返回 `NOT_FOUND`，并且不写入 feedback。
- `GET /api/chat/sessions` 在无 query 时直接过滤掉失权 KB 的历史 session。
- 显式目标 KB 操作仍可返回 `FORBIDDEN`，例如创建 session 或提交 question 时请求体直接包含无权访问的 `knowledgeBaseId`。

**Consequences**: by-id read/write 路径不泄露历史资源存在性；调用方只能看到“会话或消息不存在，或你没有访问权限”。实现上必须在 repository/service 层统一把失权 session/message 视为不可见资源，而不是让 API procedure 局部判断。

## Out of Scope

- Changing the chat schema from single-KB sessions to true multi-KB sessions.
- Reworking frontend chat UI behavior.
- Fixing unrelated validation issues found in the prior review, such as UUID param validation or content-type exact matching.
- Changing retrieval ranking, citation assembly, provider calls, or ingestion behavior except where tests need authorization fixtures.

## Technical Notes

- Research note: `research/kb-authorization-current-state.md`.
- Relevant specs:
  - `.trellis/spec/backend/security.md`
  - `.trellis/spec/backend/package-boundaries.md`
  - `.trellis/spec/backend/api-module.md`
  - `.trellis/spec/backend/api-contract.md`
  - `.trellis/spec/shared/typescript.md`
  - `.trellis/spec/guides/cross-layer-thinking-guide.md`
  - `.trellis/spec/guides/code-reuse-thinking-guide.md`
