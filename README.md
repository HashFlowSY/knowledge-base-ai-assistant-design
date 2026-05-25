# 知识库 AI 助手

企业级知识库 AI 助手，面向单企业私有化交付场景。项目采用模块化单体加独立 Worker 的 monorepo 架构，目标是把文档、网页等知识来源接入统一知识库，并提供基于权限过滤、混合检索、引用溯源和审计记录的 AI 问答能力。

当前代码已经推进到后端真实链路接入阶段：认证/会话、用户管理、知识库 CRUD、文件上传保存、Provider 配置、密钥加密、BullMQ ingestion worker、数据库、Redis、MinIO 和 Meilisearch 均已接入运行时。前端的登录、工作台、用户管理和模型服务页面已经通过 typed Hono client 调用真实 API；聊天问答、任务/处理日志/审计列表和完整 RAG 回答生成仍在待实现范围内。

## 技术栈

| 层级 | 技术 |
| --- | --- |
| Monorepo | pnpm workspace、Turborepo、TypeScript strict |
| 前端 | Next.js 16 App Router、React 19.2、Tailwind CSS、TanStack Query、lucide-react |
| API | Hono、Hono RPC 类型客户端、Zod、Better Auth、Redis 限流 |
| Worker | Node.js、tsx、BullMQ、ingestion worker 生命周期与任务恢复 |
| 数据库 | PostgreSQL 17、pgvector、Drizzle ORM、drizzle-kit |
| 检索与存储 | Meilisearch index writer、MinIO/S3-compatible object storage、pgvector |
| 测试与质量 | Vitest、Playwright、ESLint、Prettier |
| 本地基础设施 | Docker Compose: PostgreSQL、Redis、Meilisearch、MinIO |

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
  Ingestion["src/packages/ingestion<br/>解析、切块、向量化、索引"]
  RAG["src/packages/rag<br/>检索与引用契约"]
  AI["src/packages/ai-providers<br/>Provider 配置、连接测试、embedding"]
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
│   ├── ingestion/                # 文档解析、normalization、chunking、embedding、索引
│   ├── rag/                      # 检索候选与引用契约
│   ├── ai-providers/             # Provider 配置、连接测试、embedding 调用
│   ├── search/                   # Meilisearch 索引写入与授权范围契约
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

### 4. 启动本地依赖服务

```bash
docker compose up -d postgres redis meilisearch minio
```

服务端口：

| 服务 | 地址 |
| --- | --- |
| PostgreSQL | `localhost:5432` |
| Redis | `localhost:6379` |
| Meilisearch | `http://localhost:7700` |
| MinIO API | `http://localhost:9000` |
| MinIO Console | `http://localhost:9001` |

文件上传需要先创建本地对象存储 bucket：

```bash
docker exec kb-minio mc alias set local http://127.0.0.1:9000 minioadmin minioadmin
docker exec kb-minio mc mb --ignore-existing local/kb-source
```

也可以登录 MinIO Console 手动创建 `kb-source`。

### 5. 初始化数据库

```bash
pnpm db:migrate
pnpm --filter @kb/auth seed:dev-auth
```

开发种子会创建默认租户和两个本地账号：

| 角色 | 邮箱 | 密码 |
| --- | --- | --- |
| admin | `admin@example.com` | `password123` |
| member | `member@example.com` | `password123` |

`seed:dev-auth` 在 `NODE_ENV=production` 下会拒绝执行。

### 6. 启动应用

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

### 7. 常用质量命令

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

## 当前项目进度

已完成：

- Monorepo 基础：pnpm workspace、Turborepo、strict TypeScript、ESLint、Prettier、Vitest、Playwright。
- 本地基础设施：`compose.yaml` 提供 PostgreSQL/pgvector、Redis、Meilisearch、MinIO。
- 前端真实 API 页面：登录、会话保护、知识库工作台、文件上传、用户管理、模型服务配置已接入 TanStack Query + typed Hono client。
- API 基础：Hono app、请求 ID、健康检查、统一响应 envelope、认证路由、用户管理路由、知识库路由、文档上传路由、Provider 路由、CSRF/content-type/admin guard、Redis/in-memory rate limiter。
- 认证与用户管理：Better Auth 服务边界、会话契约、固定 `admin/member` 角色、用户 CRUD/service operations、开发种子账号。
- 知识库与文档上传：知识库列表/详情/创建/更新、成员授权、文件上传校验、重复上传识别、MinIO 写入、审计记录、ingestion job 入库与 BullMQ 入队。
- Provider 配置：chat/embedding/rerank 配置类型、admin-only API、浏览器端 RSA-OAEP 传输加密、服务端 AES-256-GCM 入库加密、连接测试、脱敏展示和审计事件。
- Worker 与 ingestion：BullMQ worker、stale job recovery、对象读取、PDF/Markdown/TXT 解析、文本归一化、chunking、embedding 调用、chunk/embedding 持久化、Meilisearch `kb_chunks` 索引写入。
- 数据库：Drizzle schema 覆盖租户、认证、知识库、文档源、ingestion、RAG、Provider、密钥、审计、系统配置等核心实体；已有 6 个迁移文件和迁移脚本。
- 基础领域包：`auth`、`users`、`knowledge`、`ingestion`、`rag`、`ai-providers`、`search`、`storage`、`queue`、`audit`、`observability`、`security` 等均有 typed public entrypoints 和单元测试。

进行中或待实现：

- 聊天页仍未接入真实 RAG 查询 API，缺少检索、rerank、LLM 回答生成、引用回写和反馈闭环。
- 任务、处理日志、审计列表尚未接入后端查询 API。
- URL 抓取导入仍未实现；worker 当前只处理 `file_ingestion`。
- pgvector 检索、混合检索排序、权限过滤后的真实问答链路仍需补齐。
- 文档列表/详情在工作台内仍是摘要占位，尚未做完整文档浏览与状态追踪体验。
- 生产部署、备份恢复、监控采集、外部 OpenAPI 输出和运维文档仍需补齐。
