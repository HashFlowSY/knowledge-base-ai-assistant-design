# 企业级知识库 AI 助手设计

日期：2026-05-14

## 1. 项目阶段与约束

当前项目从 0 开始构建企业级知识库 AI 助手，使用 `mindfold-ai/Trellis` 作为 harness 框架。当前阶段只做设计，不创建 Git 仓库、不运行 Trellis 初始化、不执行 npm、pnpm 或项目初始化脚本。

## 2. 首版目标与范围

首版定位为 Production v1，面向单企业私有化交付。系统架构和数据库设计保留多租户能力，但运行模式只交付单企业模式。

必须包含：

- 企业管理能力。
- 企业安全基线。
- 任务状态与文档处理日志。
- 日志审计。
- 健康检查、配置校验、部署文档、备份恢复说明和升级迁移策略。

暂不包含：

- HA、大规模集群和 Kubernetes 生产交付。
- DOCX、XLSX、CSV、PPTX 解析。
- 多语言 UI。
- 多步 Agent 工作流。
- 自定义角色和角色管理页面。

## 3. 产品能力

### 3.1 知识来源

首版支持手动上传文件和网页 URL 提取内容。解析格式包括 PDF、Markdown、TXT、HTML/URL。

知识来源模块需要保留连接器扩展边界，后续可接入 Notion、Confluence、Google Drive、Slack 等来源。

### 3.2 语言与文案

首版 UI 使用中文，优先保证中文问答体验。不接入 i18n 框架，但 UI 文案、导航、表单错误、系统提示、邮件或通知文案应集中组织，避免散落在组件中。

### 3.3 认证与权限

认证框架使用 `Better Auth`。角色固定为 `admin` 和 `member`，保留用户管理，不做角色管理页面，也不支持自定义角色或权限模型。

权限粒度为知识库级别，文档和 chunk 继承所属知识库权限。检索阶段必须按租户和知识库授权过滤。

## 4. 架构决策

采用方案 A：模块化单体 + 独立 Worker，功能域 package 优先。

结构：

- `src/apps/web`：Next.js 管理端和聊天端。
- `src/apps/api`：Hono API，负责认证、管理接口、聊天接口和 OpenAPI 输出。
- `src/apps/worker`：BullMQ ingestion worker。
- `src/packages/*`：按功能域拆分共享能力。

运行方式：

- API 处理登录、用户管理、知识库管理、聊天问答和 Provider 配置等同步请求。
- Worker 处理文件解析、URL 抓取、chunking、embedding、索引写入和任务重试。
- PostgreSQL + pgvector 存储业务数据和向量。
- Meilisearch 提供关键词检索。
- RAG 层融合向量检索和关键词检索结果，经通义/百炼 rerank 后调用 DeepSeek 生成回答。

选择原因：

- 满足 monorepo、功能域 package 和独立 worker 的要求。
- Production v1 工程复杂度可控，避免过早拆微服务。
- `rag`、`ingestion`、`ai-providers` 后续可独立服务化。
- Trellis 适合围绕清晰目录和任务边界生成开发任务。

治理要求：

- API 只做 HTTP、认证上下文、参数校验、权限检查、错误映射和 package 编排。
- 核心业务逻辑放入对应功能域 package。
- 数据库、Redis、Meilisearch 和 Provider API 调用必须设置连接池、并发控制和限流策略。
- package 依赖方向通过约定和 lint 规则控制，禁止循环依赖。

未采用方案：

- API + RAG 服务 + Worker 三服务拆分：扩展性更好，但首版部署、观测、配置和测试成本偏高。
- API 聚合 + Worker 轻量拆分：初始化更快，但功能边界不足，不适合作为 Production v1 起点。

## 5. 技术栈

- Monorepo：`pnpm workspaces`、Turborepo、TypeScript strict。
- 前端：Next.js、Tailwind CSS、shadcn/ui、TanStack Query。
- 后端：HonoJS on Node.js、Better Auth、Hono RPC、OpenAPI 输出。
- Worker：Node.js、BullMQ、Redis。
- 数据与基础设施：PostgreSQL、pgvector、Meilisearch、Redis、MinIO、S3-compatible object storage。
- ORM 与迁移：Drizzle ORM、drizzle-kit。

开发环境使用 Docker Compose 管理 PostgreSQL、Redis、Meilisearch、MinIO，本地用 Node.js 和 pnpm 跑应用。生产部署目标为单机或单 VM Docker Compose 私有化交付，架构不阻断未来迁移 Kubernetes。

## 6. 初始目录设计

初始应用：

- `src/apps/web`
- `src/apps/api`
- `src/apps/worker`

初始 packages：

- `src/packages/db`
- `src/packages/auth`
- `src/packages/users`
- `src/packages/knowledge`
- `src/packages/ingestion`
- `src/packages/rag`
- `src/packages/ai-providers`
- `src/packages/search`
- `src/packages/storage`
- `src/packages/queue`
- `src/packages/audit`
- `src/packages/security`
- `src/packages/observability`
- `src/packages/config`
- `src/packages/shared`

职责边界：

- `src/apps/*` 可以依赖功能域 package。
- 功能域 package 只能依赖基础 package 或明确允许的邻接 package。
- 基础 package 包括 `db`、`config`、`shared`、`observability`。
- 禁止把核心业务逻辑堆在 `src/apps/api` 或 `src/apps/worker`。

## 7. RAG 与 Ingestion

### 7.1 Ingestion Pipeline

ingestion 使用固定流水线：

1. Source connector
2. Parser
3. Normalizer
4. Chunker
5. Embedding
6. Index writer

首版 connector 为 file upload 和 web URL。后续预留 Notion、Confluence、Google Drive、Slack。

每次导入生成 ingestion job，并持久化 job 状态、当前步骤、错误信息、重试次数、处理日志、关联知识库和文档。前端任务队列状态页和文档处理日志页读取这些数据。

### 7.2 RAG Query Pipeline

查询链路：

1. 会话上下文整理。
2. 查询改写或补全。
3. 知识库权限过滤。
4. pgvector 向量检索。
5. Meilisearch 关键词检索。
6. 混合结果融合。
7. 通义/百炼 rerank。
8. 引用片段组装。
9. DeepSeek 生成回答。
10. 引用溯源和反馈记录。

回答必须包含引用，引用可跳转到来源文档或网页片段。反馈记录包括有用/无用、可选文本原因、关联 chat message、关联 retrieval run 和关联引用集合。

### 7.3 AI Provider

Provider 层位于 `src/packages/ai-providers`。

首版默认：

- DeepSeek：chat LLM。
- 通义/百炼：embedding。
- 通义/百炼：rerank。

Provider 抽象需支持后续接入 OpenAI、Azure OpenAI、Anthropic、本地模型、国产模型和 OpenAI-compatible provider。

管理端提供独立 Provider/密钥配置页，仅 `admin` 可访问。Provider key 首版入库加密，使用部署级 `APP_ENCRYPTION_KEY` 做应用层加密，并预留 Vault/KMS secret backend。UI 仅脱敏展示，新增、更新、禁用、查看状态操作都写审计日志。

## 8. 数据模型与权限

数据库按多租户预留设计。核心表带 `tenant_id`，或可通过组织关系追溯到租户。首版初始化一个默认租户。

核心实体：

- `tenants`
- `users`
- `organizations` 或等价组织表
- `memberships`
- `knowledge_bases`
- `knowledge_base_members`
- `documents`
- `document_sources`
- `chunks`
- `chunk_embeddings`
- `ingestion_jobs`
- `ingestion_job_logs`
- `chat_sessions`
- `chat_messages`
- `retrieval_runs`
- `retrieval_results`
- `answer_citations`
- `answer_feedback`
- `provider_configs`
- `secret_records`
- `audit_logs`
- `system_settings`

具体表名可按 Better Auth 和 Drizzle 约束微调，但实体职责和关系必须保留。

权限规则：

- `admin` 可以管理用户、知识库、Provider 密钥、导入任务和系统配置。
- `member` 可以访问被授权的知识库，并按知识库授权上传文件或导入 URL。
- 检索 SQL 和 Meilisearch filter 必须带 tenant 与 knowledge base 过滤条件。
- Provider 密钥管理、用户管理、审计日志查看等管理操作只允许 `admin`。

审计日志至少包括 actor、action、target、metadata、request id、ip/user-agent 摘要和 timestamp。禁止记录明文密钥和完整敏感内容。

## 9. 前端与 API 契约

首版页面：

- 登录。
- 知识库列表与详情。
- 上传文件与 URL 导入。
- 聊天问答、引用跳转、回答反馈。
- 用户管理。
- 任务队列状态。
- 文档处理日志。
- Provider/密钥配置页。

前端用 TanStack Query 管理 server state。用户管理、任务队列、文档日志和审计相关列表使用基于 shadcn/ui Table 的轻量列表组件，不引入额外表格状态库；分页、排序、过滤和搜索参数由 API 统一承载，前端只负责展示、筛选控件和状态同步。

聊天页支持会话级知识库选择、多轮上下文、流式回答、引用列表、引用跳转和反馈入口。Admin-only 页面和操作必须按权限隐藏或禁用。

内部前端调用采用 Hono RPC，以共享 API 类型。长期和外部集成契约通过 OpenAPI 输出，关键接口包括管理、ingestion、chat、provider 配置和健康检查接口。

API 错误返回采用统一结构：

- `code`
- `message`
- `requestId`
- `validationErrors`，可选

## 10. 安全与可观测性

安全基线：

- 输入校验。
- 文件大小限制。
- 文件类型白名单。
- URL allow/deny 策略。
- 速率限制。
- 审计日志。
- 密钥管理规范。
- 管理员操作记录。
- CSRF/CORS 策略。
- SSRF 防护。

URL 导入的 SSRF 防护包括协议限制、私网地址阻断、本机地址阻断、重定向校验、超时限制和响应大小限制。

敏感信息要求：

- Provider 密钥、对象存储凭据、数据库连接串等敏感配置禁止进入普通日志。
- 审计 metadata 禁止包含明文密钥。
- prompt、chunk 内容、模型响应全文默认不进入普通日志。

可观测性：

- 使用结构化日志，包含 `requestId`、`jobId`、`tenantId`、`actorId`、`action`。
- 接入 OpenTelemetry traces 和 metrics。
- 开发环境先输出到 console。
- 日志级别默认克制，避免正常请求、chunk 内容、prompt、模型响应全文污染控制台。

## 11. 运维与部署

开发环境：

- Docker Compose 管理 PostgreSQL、Redis、Meilisearch、MinIO。
- 本地 Node.js 和 pnpm 跑 Next.js、API、worker。

生产环境：

- 单机或单 VM Docker Compose。
- web、api、worker、PostgreSQL、Redis、Meilisearch、MinIO 或外部对象存储配置都容器化或可配置。

Production v1 交付必须包含健康检查、配置校验、备份恢复说明、部署文档和升级迁移策略。首版不承诺 HA 和大规模集群，但配置和目录不能阻断未来迁移 Kubernetes。

## 12. 测试与质量

测试工具：

- Vitest。
- Testcontainers。
- Playwright。

单元测试覆盖：

- chunking。
- 权限判断。
- provider 适配。
- 混合检索融合。
- 错误映射。
- 配置校验。

集成测试用 Testcontainers 启动 PostgreSQL、Redis、Meilisearch、MinIO，覆盖 ingestion 主路径、失败重试、索引写入、权限过滤和 Provider mock。

Playwright E2E 覆盖登录、创建知识库、上传文件、URL 导入、查看任务状态、聊天问答、引用跳转、反馈和 admin 配置 Provider。

代码质量：

- TypeScript strict。
- ESLint。
- Prettier。
- lint-staged。
- husky。

Turborepo 至少编排：

- `dev`
- `build`
- `typecheck`
- `lint`
- `test`
- `test:integration`
- `test:e2e`
- `db:migrate`
- `db:generate`

## 13. Trellis 协作

Trellis 只在设计文档确认后初始化。

Trellis 任务围绕功能域 package 和端到端验收拆分：

- 基础 monorepo。
- 数据库 schema。
- 认证。
- Provider 密钥管理。
- ingestion pipeline。
- RAG 检索链路。
- 聊天 UI。
- 审计日志。
- 运维 compose。
- 测试体系。

Trellis 后续生成任务和代码评审时必须遵守架构治理要求：避免 API 堆积，控制共享资源争用，保留 RAG 服务化演进路径，治理 package 数量和依赖方向。
