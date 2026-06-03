# 修复 chat 检索 chunkId 语义不一致

## Goal

修复 `/api/chat/messages` 在 RAG 检索结果持久化阶段返回 500 的问题。当前关键词检索从 Meilisearch 返回的 `chunkId` 实际是 `contentHash`，而 RAG 持久化层把 `chunkId` 当作 `document_chunks.id` UUID 外键写入 `retrieval_results` 和 `answer_citations`，导致 Postgres 类型/外键错误。目标是让 Meilisearch 索引写入真实的 `document_chunks.id`，避免 chat 检索结果和引用写库失败。

## What I Already Know

* 已复现 `POST /api/chat/messages` 返回 `500 INTERNAL_ERROR`。
* 复现请求已经写入 user message 和 `retrieval_runs(status=running)`，但没有写入 `retrieval_results` 或 `answer_citations`，说明异常发生在检索结果记录之前或记录时。
* Meilisearch 查询正常返回 hits，基础设施不是本次 500 的直接原因。
* `src/packages/ingestion/src/pipeline/pipeline.ts` 写索引时将 `chunk.contentHash` 填入 `chunkId`。
* `src/packages/rag/src/drizzle-vector.ts` 向量检索返回的是 `document_chunks.id`。
* `src/packages/rag/src/drizzle-runs.ts` 和 `src/packages/rag/src/drizzle-records.ts` 会把候选 `chunkId` 写入 UUID 外键字段。
* 数据库 schema 里 `document_chunks.id` 是 UUID 主键，`document_chunks.content_hash` 是内容 hash，二者语义不同。

## Fixed Approach

Meilisearch 索引写入 DB UUID，保持 PostgreSQL 为事实源，Meilisearch 只保存 DB UUID 回链。

1. ingestion 持久化 `document_chunks` 后，把真实 `document_chunks.id` 返回给 pipeline。
2. pipeline 写 Meilisearch 文档时，`chunkId` 使用真实 DB UUID。
3. keyword search 返回的 `chunkId` 与 vector search 保持同一语义：均为 `document_chunks.id`。

这个方案不改变数据库主键，不改变 RAG schema，不改变 retrieval/citation 外键设计。当前环境已有数据不作为本任务约束；实现只保证修复后的新 ingestion 数据一致。

## Requirements

* Meilisearch 索引文档的 `chunkId` 必须表示 `document_chunks.id` UUID。
* `contentHash` 不得作为 Meilisearch 索引文档的 `chunkId`。
* vector search 和 keyword search 返回的 `RetrievalSourceCandidate.chunkId` 必须是同一种身份。
* fusion 按 `chunkId` 去重时，来自 vector/keyword 的同一 chunk 必须能合并为 hybrid 候选。
* retrieval results 和 answer citations 写库必须使用有效的 `document_chunks.id`。
* 修复后新的 ingestion 输出不得再产生 hash 形态的 `chunkId`。
* 不改变当前数据库主键策略。
* 不为已有 Meilisearch 索引或已有 DB 数据提供兼容迁移。

## Acceptance Criteria

* [ ] ingestion 写入 Meilisearch 的 `chunkId` 为真实 `document_chunks.id` UUID。
* [ ] keyword search 返回候选的 `chunkId` 为 UUID，并能被 `retrieval_results.chunk_id` / `answer_citations.chunk_id` 接受。
* [ ] 一个同时命中 vector 和 keyword 的 chunk 在 fusion 后能按同一 `chunkId` 去重合并。
* [ ] `/api/chat/messages` 对 ready 文档提交问题后不再因 `chunkId` 类型错误返回 500。
* [ ] 成功回答会写入 user message、assistant message、retrieval run、retrieval results 和 answer citations。
* [ ] Rerank 输入/输出仍以 `chunkId` 关联候选，且语义为 DB UUID。
* [ ] 测试覆盖索引写入使用 DB chunk id，而不是 content hash。
* [ ] 测试不依赖当前环境已有 Meilisearch/DB 数据。

## Non-Goals

* 不处理当前环境已有 Meilisearch 索引或旧 ingestion 数据。
* 不改变 `document_chunks.id`、`retrieval_results.chunk_id`、`answer_citations.chunk_id` 的数据库类型。
* 不改 provider 配置、模型调用协议或 chat UI。

## Implementation Notes

Likely impacted files:

* `src/packages/ingestion/src/repositories/drizzle.ts`
  * 让 `persistIngestionOutput` 返回 `chunkIndex -> id` 映射，或新增可查询 persisted chunks 的接口。
* `src/packages/ingestion/src/contracts/types.ts`
  * 调整 `persistIngestionOutput` 返回类型。
* `src/packages/ingestion/src/pipeline/pipeline.ts`
  * 用持久化后的 DB chunk id 写 `createSearchIndexDocument({ chunkId })`。
* `src/packages/search/src/index.ts`
  * 确认索引文档 schema 的 `chunkId` 语义为 DB UUID。
* `src/packages/search/src/query.ts`
  * 确认返回的 `chunkId` 是索引文档中的 UUID。
* `src/packages/ingestion/src/tests/*`
  * 覆盖索引文档使用 DB chunk id。
* `src/packages/rag/src/service.test.ts` 或邻近测试
  * 覆盖 keyword-only/hybrid 候选可成功记录 retrieval results/citations。

## Flow Note

`ingestion repository` 持久化 `document_chunks` 后返回新插入的 DB chunk id；`ingestion pipeline` 使用该 DB id 写入 Meilisearch `chunkId`；`search query` 原样返回 Meilisearch `chunkId`；`rag` 将该值写入 `retrieval_results.chunk_id` 和 `answer_citations.chunk_id`。

## Data Scope

* 代码修复只保证新写入的 Meilisearch 索引正确。
* 当前环境已有数据不纳入兼容、迁移或验收范围。
* 验证应使用修复后的新 ingestion 输出或测试夹具。

## Definition Of Done

* PRD 经用户审核通过。
* 相关 spec/context 文件被加入 `implement.jsonl` / `check.jsonl`。
* 实现完成并通过 focused tests。
* 至少运行相关包测试和类型检查：
  * `pnpm --filter @kb/ingestion test`
  * `pnpm --filter @kb/search test`
  * `pnpm --filter @kb/rag test`
  * `pnpm --filter @kb/api test` 或 focused chat/API tests
  * 相关 package `typecheck`
* 若本地复现环境可用，使用修复后的新 ingestion 数据手动验证 `/api/chat/messages` 成功返回。
