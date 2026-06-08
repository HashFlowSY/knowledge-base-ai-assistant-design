# 知识库 AI 助手

企业级知识库 AI 助手，面向单企业私有化交付场景。项目采用模块化单体加独立 Worker 的 monorepo 架构，目标是把文档、网页等知识来源接入统一知识库，并提供基于权限过滤、混合检索、引用溯源和审计记录的 AI 问答能力。

当前代码已经推进到真实 RAG 基础闭环阶段：认证/会话、用户管理、知识库 CRUD、文件上传保存、文档处理状态列表与失败重试、Provider 配置、密钥加密、BullMQ ingestion worker、数据库、Redis、MinIO、Meilisearch、聊天页、Chat API、混合检索、rerank、引用和反馈均已接入运行时。聊天问答现在是非流式请求/响应链路，但查询改写/扩展、真正使用最近 3 轮历史进行多轮理解、结构化部分答案判断仍是未完成项；独立处理日志、审计列表和生产运维文档也仍在待实现范围内。

## 技术栈

| 层级         | 技术                                                                          |
| ------------ | ----------------------------------------------------------------------------- |
| Monorepo     | pnpm workspace、Turborepo、TypeScript strict                                  |
| 前端         | Next.js 16 App Router、React 19.2、Tailwind CSS、TanStack Query、lucide-react |
| API          | Hono、Hono RPC 类型客户端、Zod、Better Auth、Redis 限流                       |
| Worker       | Node.js、tsx、BullMQ、ingestion worker 生命周期与任务恢复                     |
| 数据库       | PostgreSQL 17、pgvector、Drizzle ORM、drizzle-kit                             |
| 检索与存储   | Meilisearch index writer、MinIO/S3-compatible object storage、pgvector        |
| 测试与质量   | Vitest、Playwright、ESLint、Prettier                                          |
| 本地基础设施 | Docker Compose: PostgreSQL、Redis、Meilisearch、MinIO                         |

## 架构图

```mermaid
flowchart TB
  Browser["浏览器"]
  Web["src/apps/web<br/>Next.js 管理端与聊天端"]
  API["src/apps/api<br/>Hono API"]
  Worker["src/apps/worker<br/>Ingestion Worker"]

  Auth["src/packages/auth<br/>认证与会话契约"]
  Users["src/packages/users<br/>用户管理领域逻辑"]
  KB["src/packages/knowledge<br/>知识库、文档上传与入队"]
  Ingestion["src/packages/ingestion<br/>解析、切块、向量化、索引与恢复"]
  RAG["src/packages/rag<br/>RAG 查询、引用与反馈"]
  AI["src/packages/ai-providers<br/>Provider 配置、chat / embedding / rerank"]
  Queue["src/packages/queue<br/>BullMQ 队列生产者与 payload"]
  Infra["基础包<br/>db / config / queue / security / storage / search / audit / observability / shared"]

  Postgres[("PostgreSQL + pgvector")]
  Redis[("Redis")]
  Meili[("Meilisearch")]
  MinIO[("MinIO")]
  Providers["DeepSeek / DashScope / OpenAI-compatible"]

  Browser --> Web
  Web -->|/api/* rewrite + fetch| API
  API --> Auth
  API --> Users
  API --> KB
  API --> AI
  API --> RAG
  API --> Queue
  API --> Infra
  API --> Postgres
  API --> Redis

  Queue --> Redis
  Worker --> Ingestion
  Worker --> Queue
  Worker --> Infra
  Worker --> Postgres
  Worker --> Redis
  Worker --> Meili
  Worker --> MinIO

  KB --> Infra
  Ingestion --> KB
  RAG --> KB
  RAG --> Infra
  RAG --> Meili
  RAG --> Postgres
  RAG --> AI
  AI --> Providers
```

## 目录结构

```text
.
├── compose.yaml                  # 本地 PostgreSQL、Redis、Meilisearch、MinIO
├── docs/superpowers/             # 设计文档和阶段计划
├── e2e/                          # Playwright 端到端用例
├── src/apps/
│   ├── web/                      # Next.js App Router 前端
│   ├── api/                      # Hono API、业务路由、运行时服务装配
│   └── worker/                   # BullMQ ingestion worker 入口
├── src/packages/
│   ├── auth/                     # 角色、会话、登录输入、Better Auth 服务边界
│   ├── users/                    # 用户管理 schemas、plans、service operations
│   ├── db/                       # Drizzle schema、迁移、数据库客户端、开发种子
│   ├── config/                   # 运行时环境变量校验与脱敏
│   ├── queue/                    # BullMQ 连接、payload、job options、producer
│   ├── knowledge/                # 知识库 CRUD、成员、文件上传保存与入队
│   ├── ingestion/                # 文档解析、normalization、chunking、embedding、索引与恢复
│   ├── rag/                      # RAG 查询编排、融合、rerank、上下文、引用与反馈
│   ├── ai-providers/             # Provider 配置、连接测试、embedding/chat/rerank 调用
│   ├── search/                   # Meilisearch 索引写入、关键词检索与授权范围契约
│   ├── storage/                  # S3/MinIO 对象存储客户端与文档对象 key
│   ├── security/                 # hash、cookie、限流 identity 等安全工具
│   ├── audit/                    # 审计领域契约
│   ├── observability/            # 结构化日志与脱敏
│   └── shared/                   # API envelope、时间、公共类型
├── package.json                  # 根脚本和工具链依赖
├── pnpm-workspace.yaml           # workspace: src/apps/*、src/packages/*
└── turbo.json                    # dev/build/typecheck/lint/test 编排
```

## 启动配置

### 1. 环境要求

- Node.js `>=20.19.0`
- pnpm `>=10.0.0`，当前仓库声明 `pnpm@11.1.1`
- Docker 与 Docker Compose

### 2. 安装依赖

```bash
pnpm install --ignore-scripts
```

### 3. 准备环境变量

```bash
cp .env.example .env
```

本地开发建议至少填充这些值：

```dotenv
APP_BASE_URL=http://127.0.0.1:3000
API_BASE_URL=http://localhost:4000
DATABASE_URL=postgres://kb:kb_local_password@localhost:5432/kb
REDIS_URL=redis://localhost:6379
MEILISEARCH_HOST=http://localhost:7700
MEILISEARCH_MASTER_KEY=local-meili-master-key
S3_ENDPOINT=http://localhost:9000
S3_BUCKET=kb-source
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin
BETTER_AUTH_SECRET=local-better-auth-secret
APP_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef
```

前端单独的环境样例在 `src/apps/web/.env.example`，对应变量为 `NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}`。API 和 Worker 环境样例分别在 `src/apps/api/.env.example` 与 `src/apps/worker/.env.example`。

`APP_ENCRYPTION_KEY` 必须能解析成 32 字节 AES-256-GCM key；上面的值仅适合本地开发。

### 4. 一键重置本地依赖服务

如果本地 PostgreSQL、Redis、Meilisearch、MinIO 中已经积累了开发测试脏数据，推荐使用：

```bash
pnpm dev:reset
```

该命令只允许在项目根目录 `.env` 中 `NODE_ENV=development` 时执行，并会先校验 `DATABASE_URL`、`REDIS_URL`、`MEILISEARCH_HOST`、`S3_ENDPOINT`、MinIO 凭据都指向本地 Docker Compose 服务。校验失败时不会删除任何资源。

`pnpm dev:reset` 会删除当前仓库 `compose.yaml` 对应的本地中间件容器和 volumes，保留 Docker images，然后重新启动 PostgreSQL、Redis、Meilisearch、MinIO，等待健康检查，通过 `.env` 的 `S3_BUCKET` 创建 MinIO bucket，执行数据库迁移并写入开发账号 seed。命令完成后会退出，不会自动启动 `pnpm dev`。

### 5. 仅启动本地依赖服务

```bash
docker compose up -d postgres redis meilisearch minio
```

服务端口：

| 服务          | 地址                    |
| ------------- | ----------------------- |
| PostgreSQL    | `localhost:5432`        |
| Redis         | `localhost:6379`        |
| Meilisearch   | `http://localhost:7700` |
| MinIO API     | `http://localhost:9000` |
| MinIO Console | `http://localhost:9001` |

如果没有使用 `pnpm dev:reset`，文件上传需要先创建本地对象存储 bucket：

```bash
docker exec kb-minio mc alias set local http://127.0.0.1:9000 minioadmin minioadmin
docker exec kb-minio mc mb --ignore-existing local/kb-source
```

也可以登录 MinIO Console 手动创建 `kb-source`。

### 6. 初始化数据库

如果没有使用 `pnpm dev:reset`，需要手动初始化数据库和开发账号：

```bash
pnpm db:migrate
pnpm --filter @kb/auth seed:dev-auth
```

开发种子会创建默认租户和两个本地账号：

| 角色   | 邮箱                 | 密码          |
| ------ | -------------------- | ------------- |
| admin  | `admin@example.com`  | `password123` |
| member | `member@example.com` | `password123` |

`seed:dev-auth` 在 `NODE_ENV=production` 下会拒绝执行。

### 7. 启动应用

```bash
pnpm dev
```

默认端口：

- Web: `http://127.0.0.1:3000`
- API: `http://localhost:4000`
- Health: `http://localhost:4000/health`

Next.js 已配置 `/api/:path*` rewrite 到 `http://localhost:4000/api/:path*`。
浏览器访问地址需要与 `APP_BASE_URL` 的 origin 保持一致，否则 mutation guard 会拒绝登录、上传、保存等写操作。

如需让文件导入任务成功跑完，需要用 admin 登录 `/providers`，配置并启用可用的 embedding Provider；否则 worker 会把任务标记为可重试或失败。

如需让 `/chat` 跑通真实问答，至少需要启用 chat Provider；embedding Provider 用于向量检索，rerank Provider 用于重排序。rerank 不可用时系统会回退到融合排序，并把依据标签限制在 `依据有限`。

### 8. 手动验证聊天问答

```bash
pnpm dev
```

访问 `http://127.0.0.1:3000/chat`，用开发账号登录后建议按这个顺序验证：

1. 在 `/providers` 配置并启用 chat、embedding、rerank 模型服务。
2. 在知识库页面上传文件，并在文档处理列表中等待文档完成解析、切块、embedding 和索引写入；失败且仍有剩余尝试次数时可触发重试。
3. 进入 `/chat`，选择一个有权限的知识库，创建或选择会话。
4. 提交一个能被知识库支撑的问题，检查回答、依据标签、引用列表和右侧引用详情。
5. 提交一个知识库无法支撑的问题，检查是否返回“知识库中没有找到可支撑答案”。
6. 对助手回答提交“有帮助/无帮助”反馈，检查反馈状态是否更新。

### 9. 常用质量命令

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:integration
pnpm test:e2e
```

也可以按 package 定向执行：

```bash
pnpm --filter @kb/web test
pnpm --filter @kb/api test
pnpm --filter @kb/db typecheck
```

## 问答链路

当前 `/chat` 使用单知识库、非流式 RAG 请求。前端通过 TanStack Query 和 typed Hono RPC client 调用 Chat API，后端完成检索、生成和持久化后一次性返回用户消息、助手消息、引用和依据标签。

### Chat API

| 方法   | 路径                                     | 说明                                         |
| ------ | ---------------------------------------- | -------------------------------------------- |
| `GET`  | `/api/chat/sessions`                     | 查询当前用户可访问的会话列表，可按知识库过滤 |
| `POST` | `/api/chat/sessions`                     | 创建绑定单个知识库的新会话                   |
| `GET`  | `/api/chat/sessions/:sessionId/messages` | 查询会话消息与引用/反馈                      |
| `POST` | `/api/chat/messages`                     | 提交问题并返回完整 RAG 回答                  |
| `POST` | `/api/chat/messages/:messageId/feedback` | 提交助手回答反馈                             |

### RAG 流程

1. 校验登录态、租户、知识库授权和会话归属。
2. 持久化用户问题，并创建 retrieval run。
3. 使用原始问题并行执行向量检索 top 30 和关键词检索 top 30。
4. 使用 RRF 融合、按 `chunkId` 去重，保留两路 rank/score 和 `fusedScore`，取融合 top 50。
5. 调用 rerank Provider 重排序并取 top 8；如果 rerank 不可用，回退到 fused top 8 并记录安全日志。
6. 在 6,000 估算 token 预算内组装上下文，只合并同一文档中相邻的 chunk。
7. 调用 chat Provider 生成回答，写入助手消息、引用、依据标签和 retrieval results。
8. 前端展示会话、答案、引用核验面板和反馈状态。

### 模型选择

运行时代码不硬编码具体厂商模型，而是读取租户下启用的 Provider 配置：

| 用途     | Provider kind | 当前调用方式                                                               |
| -------- | ------------- | -------------------------------------------------------------------------- |
| 回答生成 | `chat`        | OpenAI-compatible `/chat/completions`，`stream: false`，`temperature: 0.2` |
| 查询向量 | `embedding`   | 通过 embedding service 对用户问题生成向量                                  |
| 重排序   | `rerank`      | OpenAI-compatible `/reranks`，以候选 chunk 文本作为 documents              |

模型的 `baseUrl`、`modelId` 和密钥都通过 `/providers` 配置。产品默认可配置 DeepSeek 作为 chat，通义/百炼或其他兼容服务作为 embedding/rerank。

## 当前项目进度

已完成：

- Monorepo 基础：pnpm workspace、Turborepo、strict TypeScript、ESLint、Prettier、Vitest、Playwright。
- 本地基础设施：`compose.yaml` 提供 PostgreSQL/pgvector、Redis、Meilisearch、MinIO。
- 前端真实 API 页面：登录、会话保护、知识库工作台、文件上传、文档处理状态列表、用户管理、模型服务配置已接入 TanStack Query + typed Hono client。
- API 基础：Hono app、请求 ID、健康检查、统一响应 envelope、认证路由、用户管理路由、知识库路由、文档上传与处理状态路由、Provider 路由、Chat 路由、CSRF/content-type/admin guard、Redis/in-memory rate limiter。
- 认证与用户管理：Better Auth 服务边界、会话契约、固定 `admin/member` 角色、用户 CRUD/service operations、开发种子账号。
- 知识库与文档上传：知识库列表/详情/创建/更新、成员授权、文件上传校验、重复上传识别、MinIO 写入、审计记录、ingestion job 入库与 BullMQ 入队、文档处理分页查询和失败重试。
- Provider 配置：chat/embedding/rerank 配置类型、admin-only API、浏览器端 RSA-OAEP 传输加密、服务端 AES-256-GCM 入库加密、连接测试、脱敏展示、审计事件和运行时调用。
- Worker 与 ingestion：BullMQ worker、stale job recovery、对象读取、PDF/Markdown/TXT 解析、文本归一化、chunking、embedding 调用、chunk/embedding 持久化、Meilisearch `kb_chunks` 索引写入、retry/failure 状态对齐；Drizzle 仓储已按 job、source、output、recovery、cleanup 等职责拆分。
- 数据库：Drizzle schema 覆盖租户、认证、知识库、文档源、ingestion、RAG、Provider、密钥、审计、系统配置等核心实体；已有 6 个迁移文件和迁移脚本。
- 聊天/RAG 基础闭环：`/chat` 已从 mock store 切换到真实 API；支持单知识库会话、消息持久化、向量+关键词混合检索、RRF 融合、rerank/fallback、上下文组装、引用回写、依据标签和回答反馈。
- 基础领域包：`auth`、`users`、`knowledge`、`ingestion`、`rag`、`ai-providers`、`search`、`storage`、`queue`、`audit`、`observability`、`security` 等均有 typed public entrypoints 和单元测试。

进行中或待实现：

- 查询改写/扩展尚未实现；当前检索直接使用原始问题。
- 最近 3 轮历史已从数据库读取，但尚未用于 query rewrite 或最终 chat prompt。
- 部分答案策略目前主要依赖提示词约束，尚未做结构化判断和专门测试。
- 独立任务管理、完整处理日志浏览、审计列表尚未接入后端查询 API。
- URL 抓取导入仍未实现；worker 当前只处理 `file_ingestion`。
- 文档正文浏览和详情页仍未完整实现；工作台当前提供知识库摘要、成员摘要和文档处理状态列表。
- Chat 前端组件状态测试仍偏薄，当前主要覆盖 hooks、布局与后端/RAG 单元测试；发布前建议补充浏览器级集成或 E2E 场景。
- 生产部署、备份恢复、监控采集、外部 OpenAPI 输出和运维文档仍需补齐。
