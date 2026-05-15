# 数据库设计

## Goal

为知识库 AI 助手设计 Production v1 可落地的数据库模型与迁移方案，覆盖多租户预留、知识库权限、文档 ingestion、RAG 检索、聊天引用、Provider 密钥配置、审计日志和系统设置，为后续 Drizzle schema 实现提供清晰边界。

## What I Already Know

* 项目是 TypeScript strict + pnpm workspace + Turborepo monorepo。
* 当前 README 明确说明 PostgreSQL/pgvector、Redis、Meilisearch、MinIO 本地服务已在 Compose 中预留，但数据库 schema 尚未实现。
* `src/packages/db` 目前只有数据库配置和迁移状态占位；`db:migrate` 和 `db:generate` 已预留。
* 既有总设计要求 Production v1 面向单企业私有化交付，但数据库设计需要保留多租户能力。
* ORM 与迁移目标为 Drizzle ORM + drizzle-kit。
* 核心业务表初步包括 tenants、users、organizations/memberships、knowledge bases、documents/sources/chunks/embeddings、ingestion jobs/logs、chat sessions/messages、retrieval runs/results、citations、feedback、provider configs、secret records、audit logs、system settings。
* 约束来自 `.trellis/spec/backend/database.md`、`.trellis/spec/backend/rag-ingestion.md`、`.trellis/spec/backend/audit.md`、`.trellis/spec/shared/typescript.md`。
* Better Auth 官方 Drizzle 文档与数据库概念文档已记录在 `research/better-auth-drizzle.md`。
* 通义/百炼 embedding 维度资料已记录在 `research/embedding-dimensions.md`。

## Assumptions (Temporary)

* 数据库命名优先使用 snake_case，以减少 PostgreSQL raw SQL 引号需求。
* 首版使用默认租户，但所有权限、检索、审计和业务数据查询都按 tenant scope 设计。
* Better Auth 需要的认证表可以按其适配器约束微调，但用户、成员关系和权限模型需要和业务实体保持清晰关系。

## Open Questions

* 是否接受当前 PRD 汇总并进入实现阶段？

## Requirements (Evolving)

* 本任务交付范围确定为设计 + Drizzle schema + 初始迁移，目标是解除后续认证、ingestion、RAG 和审计任务的数据库阻塞。
* 初始迁移需要在本地 Compose PostgreSQL 可用时实际跑通；不是只生成迁移文件。
* 初始 schema 需要纳入 Better Auth 兼容的核心认证表，避免后续认证任务再引入基础表返工。
* Drizzle schema 文件按领域拆分：auth、tenant、knowledge、ingestion、rag、audit、system 等分文件，统一从 package entrypoint 导出。
* `chunk_embeddings` 使用固定首版默认向量维度，并记录 provider/model 绑定；后续更换 embedding 模型通过新增迁移和重嵌入处理。
* 初始 embedding 默认采用 `text-embedding-v4` 的 1024 维，对应 pgvector `vector(1024)`。
* 设计必须覆盖租户、用户/成员关系、知识库授权、文档与来源、chunk 与 embedding、ingestion job/log、聊天、检索运行、引用、反馈、Provider 配置、密钥记录、审计日志、系统设置。
* 所有核心业务表必须能按 tenant 过滤；知识库、文档、chunk、检索结果必须支持知识库级授权过滤。
* ingestion 相关表必须支持固定流水线步骤、状态记录、失败原因、重试次数和幂等写入。
* RAG 相关表必须能持久化 retrieval run、候选结果、最终引用和反馈，且保留 provider/model 元数据。
* Provider 密钥不能明文存储；配置表与 secret metadata 分离，审计 metadata 不包含密钥。
* 审计日志必须支持 tenant、actor、action、target、request id、IP/user-agent 摘要和时间范围查询。
* 需要设计高价值索引：tenant scope、knowledge base scope、ingestion status/time/document、audit actor/action/time、retrieval run/message、vector search。

## Acceptance Criteria (Evolving)

* [x] PRD 明确数据库设计范围、实体清单、关系和 out-of-scope。
* [x] 技术方案明确 Drizzle schema 组织方式、迁移入口、命名规范和索引策略。
* [x] Schema 文件按领域拆分并通过统一 entrypoint 导出。
* [x] `chunk_embeddings` 存储 `provider_id`、`model_id`、`dimensions`，并使用首版固定的 pgvector 维度。
* [x] `src/packages/db` 提供 Drizzle schema exports、迁移配置和基础验证测试。
* [x] 初始 migration 文件生成并提交。
* [x] 本地 Compose PostgreSQL 可用时，`pnpm db:migrate` 能实际执行并创建初始 schema。
* [x] `pnpm --filter @kb/db typecheck` 和相关测试通过。
* [x] 数据设计与既有架构设计、Trellis backend/shared/testing 规范一致。

## Scope Estimate

### Option 1: Design Only

* Workload: small to medium.
* Expected output: entity/relationship design, table responsibilities, key indexes, migration strategy notes.
* No code or migration execution.

### Option 2: Design + Drizzle Schema

* Workload: medium.
* Expected output: Drizzle table definitions, typed exports, schema organization, basic tests/type checks.
* Migration command can remain a placeholder or generate-only path.

### Option 3: Design + Schema + Initial Migration

* Workload: medium to large.
* Expected output:
  * Drizzle schema for the Production v1 core tables.
  * `drizzle.config` or equivalent generation config.
  * Generated initial migration files.
  * Migration runner wired to real PostgreSQL.
  * Local migration verification against Compose PostgreSQL.
  * Basic tests for schema exports/config and migration status.
* Main complexity drivers:
  * Better Auth table compatibility.
  * pgvector extension and embedding column/index choices.
  * Enum/status modeling for ingestion, retrieval, provider config, audit, and chat.
  * Foreign key and cascade rules across tenant, knowledge base, document, chunk, retrieval, and citation data.
  * Index strategy for tenant filtering, ingestion queues, audit lists, retrieval lookup, and vector search.
  * Whether generated migrations must be executed locally in this task.

Selected scope: Option 3. Keep this task limited to database infrastructure, schema, and initial migration; do not implement business APIs or worker pipeline behavior here.

## Definition of Done

* Requirements confirmed by user.
* Design decisions recorded in this PRD.
* Implementation scope is explicitly accepted or marked out of scope.
* Applicable lint/typecheck/tests run if code changes are made.
* Specs or notes updated if new reusable database conventions emerge.

## Out of Scope (Explicit)

* HA、大规模分库分表、Kubernetes 生产交付。
* 完整业务 API、UI、worker pipeline、RAG provider 调用实现。
* 自定义角色/权限模型和角色管理页面。
* 非 Production v1 文件格式解析扩展，如 DOCX/XLSX/CSV/PPTX。

## Technical Notes

* Relevant package: `src/packages/db`.
* Existing compose service: `pgvector/pgvector:pg17` with database `kb`.
* Existing migration command placeholder: `pnpm db:migrate`; generation placeholder: `pnpm db:generate`.
* Existing design reference: `docs/superpowers/specs/2026-05-12-knowledge-base-ai-assistant-design.md`.
* Relevant specs:
  * `.trellis/spec/backend/database.md`
  * `.trellis/spec/backend/rag-ingestion.md`
  * `.trellis/spec/backend/audit.md`
  * `.trellis/spec/shared/typescript.md`
  * `.trellis/spec/testing/strategy.md`

## Research References

* [`research/better-auth-drizzle.md`](research/better-auth-drizzle.md) — Better Auth supports Drizzle, expects ORM-managed migrations, and requires core auth tables such as user/session/account/verification.
* [`research/embedding-dimensions.md`](research/embedding-dimensions.md) — `text-embedding-v4` supports 1024 dimensions as the default, which fits the fixed initial pgvector column strategy.

## Implementation Notes

* Implementation started after user confirmation.
* Added public contract tests for schema registry exports, migration config, migration status, and vector dimension.
* Added Drizzle schema files split by domain under `src/packages/db/src/schema/`.
* Added migration runner draft in `src/packages/db/src/migrate.ts`.
* Dependency installation was restored with `pnpm install --ignore-scripts --config.confirmModulesPurge=false`.
* Generated initial Drizzle migration under `src/packages/db/drizzle/`.
* Verified local migration against Compose PostgreSQL with `pnpm db:migrate`.
* Verified quality with `pnpm --filter @kb/db test`, `pnpm --filter @kb/db typecheck`, `pnpm --filter @kb/db lint`, `pnpm test`, `pnpm typecheck`, and `pnpm lint`.
* Ran full code review and security scan after implementation.
* Fixed production config safety issue: migration runner and Drizzle config now load `.env.example` only outside production.
* Fixed dependency audit findings by upgrading `drizzle-orm`, `drizzle-kit`, `vitest`, adding compatible root `vite`, and using pnpm workspace overrides for patched `postcss` and Drizzle Kit's legacy `esbuild` transitive dependency.
* Added Better Auth schema note and database spec requirement that later auth runtime must hash/encrypt tokens before persistence where required by project security policy.
* Fixed migration drift after auth column hardening by generating `0002_magenta_leech.sql`, which renames OAuth/password columns to encrypted/hash column names.
* Fixed fresh migration failure from tenant-scoped composite FKs by creating `(tenant_id, id)` unique indexes before dependent FKs in `0001_wooden_gabe_jones.sql`.
* Fixed missing `(tenant_id, id)` unique index on `answer_citations` and moved `answer_feedback_citations_tenant_citation_fk` to `0003_motionless_punisher.sql` so the FK is added only after the referenced key exists.
* Verified final quality/security with `pnpm audit --prod`, `pnpm audit`, `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm db:generate`, and `pnpm db:migrate`.
