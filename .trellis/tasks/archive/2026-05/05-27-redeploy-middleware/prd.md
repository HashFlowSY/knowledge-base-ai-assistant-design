# brainstorm: 一键重新部署依赖中间件

## Goal

完善当前项目的本地启动逻辑，提供一种可一键重新部署依赖中间件的方式，用于清理多次开发测试后残留在 Docker 中间件容器和数据卷内的垃圾数据，并恢复到可继续开发测试的干净状态。

## What I Already Know

- 用户明确要求先澄清需求，禁止未澄清就开始实现。
- 当前项目依赖已经部署好的 Docker 容器运行本地中间件。
- 多次开发测试后，容器或数据卷中存在垃圾数据，目前需要手动删除镜像并重启镜像，流程麻烦。
- 用户已确认一键重建允许删除 Docker volumes 中的本地持久化数据。
- 用户已确认重建命令默认执行完整本地初始化。
- 用户已确认破坏性重置命令不需要二次交互确认，但必须明确只能在 dev 环境执行。
- 用户已确认 dev-only 保护采用双重保护：检查 dev 环境，并限定只操作当前仓库 Compose 定义的本地资源。
- 用户已确认重建命令完成中间件重建和初始化后退出，不自动启动 `pnpm dev`。
- 用户已确认一键重建命令入口命名为 `pnpm dev:reset`。
- 用户已确认 dev 环境判定读取项目根目录 `.env` 中的 `NODE_ENV=development`。
- 用户已确认重建流程不删除 Docker images，只删除当前 Compose 项目的容器和 volumes，并复用本地已有 images。
- 用户已确认 MinIO bucket 创建应优先读取项目根目录 `.env` 中的 `S3_BUCKET`，且该变量必须存在且非空；本地默认文档建议值仍为 `kb-source`。
- 用户已确认使用 TypeScript 编写本地重置脚本，并通过 `pnpm dev:reset` 调用。
- 用户已确认在执行迁移、seed、bucket 初始化前，需要校验 `.env` 中的依赖地址和凭据都指向本地 Compose 服务。
- 用户已批准按推荐方案进入实现准备。
- 仓库使用 pnpm workspace、Turborepo、TypeScript strict。
- 根目录已有 `compose.yaml`，定义本地 PostgreSQL、Redis、Meilisearch、MinIO。
- 当前根脚本包括 `dev`、`build`、`typecheck`、`lint`、`test`、`test:integration`、`test:e2e`、`db:migrate`、`db:generate`。
- README 当前手动启动流程是：复制 `.env`、`docker compose up -d postgres redis meilisearch minio`、创建 MinIO bucket、执行 `pnpm db:migrate`、执行 `pnpm --filter @kb/auth seed:dev-auth`、再 `pnpm dev`。
- 文件上传依赖 MinIO bucket `kb-source`，README 当前通过 `docker exec kb-minio mc alias set ...` 和 `docker exec kb-minio mc mb --ignore-existing local/kb-source` 手动创建。
- Ops 规范规定本地开发用 Docker Compose 跑 PostgreSQL、Redis、Meilisearch、MinIO；Node.js 与 pnpm 本地运行应用服务，除非任务明确目标是容器化应用服务。

## Assumptions (Temporary)

- 目标主要面向本地开发/测试环境，而非生产环境。
- “重新部署依赖中间件”应至少覆盖 Compose 中的四个依赖服务及其持久化数据。
- 清理动作需要有防误删保护，避免对非本地/生产数据执行破坏性操作。
- 初始版本不需要把 web/api/worker 应用服务也容器化。

## Open Questions

- 无。

## Requirements (Evolving)

- 提供一键重新部署本地依赖中间件的入口。
- 命令入口为 `pnpm dev:reset`。
- `pnpm dev:reset` 调用 TypeScript 本地重置脚本；优先使用项目已有 `tsx` 工具执行。
- 重建流程允许删除 Compose 定义的本地 Docker volumes：`postgres-data`、`redis-data`、`meilisearch-data`、`minio-data`。
- 重建流程不删除 Docker images；如果本地缺失 image，由 Docker Compose 正常拉取。
- 重建流程默认恢复必要的基础资源，包括创建 MinIO bucket、执行数据库迁移、执行开发账号 seed。
- MinIO bucket 名称从项目根目录 `.env` 的 `S3_BUCKET` 读取；缺失或为空时拒绝继续初始化。
- 重建命令不做二次交互确认。
- 重建命令必须有 dev-only 保护，不允许在非 dev 环境执行。
- dev-only 保护采用双重策略：
  - 环境必须明确为 dev/development。
  - 具体判定来源为项目根目录 `.env`，必须存在 `NODE_ENV=development`。
  - 只允许操作当前仓库 `compose.yaml` 定义的本地服务、容器和 volumes。
- 初始化前必须校验 `.env` 里的依赖配置指向本地 Compose 服务：
  - `DATABASE_URL` 指向 `localhost` 或 `127.0.0.1` 的 `5432` 端口。
  - `REDIS_URL` 指向 `localhost` 或 `127.0.0.1` 的 `6379` 端口。
  - `MEILISEARCH_HOST` 指向 `localhost` 或 `127.0.0.1` 的 `7700` 端口。
  - `S3_ENDPOINT` 指向 `localhost` 或 `127.0.0.1` 的 `9000` 端口。
  - MinIO 凭据匹配 Compose 默认值 `minioadmin` / `minioadmin`。
- 重建命令不自动启动 web/api/worker 应用进程；完成后提示用户可执行 `pnpm dev`。
- 流程需要明确哪些数据会被删除，避免误操作。

## Approved Design

- Add `scripts/dev-reset.ts`, invoked by root `pnpm dev:reset`.
- The script reads the project root `.env` before doing any destructive work.
- Safety checks before deletion:
  - `.env` must exist and contain `NODE_ENV=development`.
  - `DATABASE_URL` must target `localhost` or `127.0.0.1` on port `5432`.
  - `REDIS_URL` must target `localhost` or `127.0.0.1` on port `6379`.
  - `MEILISEARCH_HOST` must target `localhost` or `127.0.0.1` on port `7700`.
  - `S3_ENDPOINT` must target `localhost` or `127.0.0.1` on port `9000`.
  - `S3_BUCKET` must exist and be non-empty.
  - `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY` must match Compose defaults `minioadmin` / `minioadmin`.
- If any safety check fails, exit before running Docker, migration, seed, or bucket commands.
- Reset flow:
  - Run `docker compose -f compose.yaml down --volumes --remove-orphans`.
  - Run `docker compose -f compose.yaml up -d postgres redis meilisearch minio`.
  - Wait for Compose services to become healthy.
  - Create the configured MinIO bucket inside `kb-minio`.
  - Run `pnpm db:migrate`.
  - Run `pnpm --filter @kb/auth seed:dev-auth`.
  - Print the deleted resource scope and next step `pnpm dev`.
- The script must not delete Docker images and must not start `pnpm dev`.

## Acceptance Criteria (Evolving)

- [ ] 用户可以通过一个明确命令重新部署本地依赖中间件。
- [ ] 重新部署后 PostgreSQL、Redis、Meilisearch、MinIO 均可用。
- [ ] 重新部署后 MinIO `kb-source` bucket 存在。
- [ ] 重新部署后 `.env` 中 `S3_BUCKET` 指定的 MinIO bucket 存在。
- [ ] 重新部署后数据库迁移已执行。
- [ ] 重新部署后开发账号 seed 可用。
- [ ] 当运行环境不是 dev 时，命令拒绝执行且不删除任何容器或 volume。
- [ ] 当项目根目录 `.env` 不存在、缺少 `NODE_ENV`、或 `NODE_ENV` 不是 `development` 时，命令拒绝执行且不删除任何资源。
- [ ] 当 `.env` 中任一依赖地址或 MinIO 凭据不匹配本地 Compose 预期时，命令拒绝执行且不删除任何资源。
- [ ] 命令只删除当前 Compose 项目的本地中间件资源，不影响其他 Docker 资源。
- [ ] 命令不删除 Docker images。
- [ ] 命令完成后退出，不长期占用终端。
- [ ] 文档说明命令用途、会删除的数据范围、适用环境和必要前置条件。

## Definition of Done

- Tests added/updated where appropriate.
- Lint / typecheck / relevant checks pass.
- README or operations docs updated if startup behavior changes.
- Rollback or recovery path considered for destructive reset behavior.

## Out of Scope (Explicit)

- 生产环境重置或生产数据删除自动化。
- Kubernetes 部署。
- 将 web/api/worker 应用服务容器化，除非后续需求明确要求。

## Technical Notes

- Relevant files inspected:
  - `compose.yaml`
  - `package.json`
  - `README.md`
  - `.env.example`
  - `src/packages/db/package.json`
  - `src/packages/auth/package.json`
  - `.trellis/spec/ops/deployment.md`
  - `.trellis/spec/backend/index.md`
  - `.trellis/spec/shared/index.md`
  - `.trellis/spec/testing/index.md`
- Relevant existing commands:
  - `docker compose up -d postgres redis meilisearch minio`
  - `pnpm db:migrate`
  - `pnpm --filter @kb/auth seed:dev-auth`
- Relevant existing service names and containers:
  - Compose services: `postgres`, `redis`, `meilisearch`, `minio`
  - Container names: `kb-postgres`, `kb-redis`, `kb-meilisearch`, `kb-minio`
  - Volumes: `postgres-data`, `redis-data`, `meilisearch-data`, `minio-data`
