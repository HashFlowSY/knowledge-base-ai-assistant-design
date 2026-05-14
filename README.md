# 知识库 AI 助手

企业级知识库 AI 助手的本地开发骨架。当前阶段只搭建 monorepo、应用入口、package 边界、基础工具链和本地依赖服务，不实现认证、数据库 schema、RAG、ingestion 或真实业务页面。

## 结构

```text
src/apps/web      Next.js 管理端和聊天端入口
src/apps/api      Hono API 入口，当前提供 /health
src/apps/worker   BullMQ worker 生命周期入口
src/packages/*    领域、基础设施和共享基础包
```

## 本地依赖服务

基础设施由 Docker Compose 启动，应用由本地 Node.js 和 pnpm 启动。

```bash
docker compose up -d postgres redis meilisearch minio
```

服务端口：

- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`
- Meilisearch: `localhost:7700`
- MinIO API: `localhost:9000`
- MinIO Console: `localhost:9001`

## 环境变量

复制 `.env.example` 到本地 `.env` 后按需调整。示例值只用于本地开发，不用于生产。

## 开发命令

```bash
pnpm install --ignore-scripts
pnpm dev
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:integration
pnpm test:e2e
```

数据库迁移命令已预留：

```bash
pnpm db:generate
pnpm db:migrate
```

当前数据库 schema 尚未实现，迁移命令只作为后续数据库任务的入口。

## 当前范围

已包含：

- pnpm workspace 和 Turborepo 编排。
- strict TypeScript、ESLint、Prettier、Vitest、Playwright 配置。
- Next.js 16、React 19.2 和 App Router 基础入口。
- `web`、`api`、`worker` 最小可运行入口。
- PostgreSQL/pgvector、Redis、Meilisearch、MinIO 本地 Compose 服务。
- 初始功能域 package 边界和 typed public entrypoints。

未包含：

- Better Auth 登录和用户管理。
- Drizzle schema 与真实迁移。
- 文件/URL ingestion pipeline。
- RAG 检索、rerank、LLM 调用和引用生成。
- Provider 密钥管理、审计日志 UI、生产部署自动化。
