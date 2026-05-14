# Initial Project Structure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a full local-development bootstrap for the enterprise knowledge-base AI assistant.

**Architecture:** Use a pnpm/Turborepo TypeScript monorepo with runnable app packages under `src/apps/*` and narrow public package APIs under `src/packages/*`. Apps own framework process entrypoints; shared runtime contracts, config, logging, and placeholder domain boundaries live in packages.

**Tech Stack:** pnpm workspaces, Turborepo, TypeScript strict, Next.js, Hono, Node.js/tsx, Zod, Vitest, Playwright, Docker Compose with PostgreSQL/pgvector, Redis, Meilisearch, and MinIO.

---

### Task 1: Workspace And Tooling Contracts

**Files:**
- Modify: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `tsconfig.base.json`
- Create: `eslint.config.mjs`
- Create: `prettier.config.mjs`
- Create: `.prettierignore`
- Create: `.gitignore`

- [ ] Define root workspace scripts for `dev`, `build`, `typecheck`, `lint`, `format`, `test`, `test:integration`, `test:e2e`, `db:migrate`, and `db:generate`.
- [ ] Add strict shared TypeScript options and path aliases for `@kb/*` package names.
- [ ] Add ESLint flat config that type-checks TypeScript without permitting `any`, non-null assertions, or ts-ignore comments.
- [ ] Add Prettier config and ignores for generated/build folders.

### Task 2: Shared Package Skeletons

**Files:**
- Create one `package.json`, `tsconfig.json`, `src/index.ts`, and `src/index.test.ts` for each package under `src/packages/*`.

- [ ] Create all packages from the architecture spec: `db`, `auth`, `users`, `knowledge`, `ingestion`, `rag`, `ai-providers`, `search`, `storage`, `queue`, `audit`, `security`, `observability`, `config`, and `shared`.
- [ ] Give every package a stable `@kb/<name>` package name and typed public entrypoint.
- [ ] Keep placeholders behavior-free except for bootstrap-safe contracts such as service names, package descriptors, config parsing, and logger helpers.
- [ ] Add package-level tests that prove public entrypoints are importable and typed.

### Task 3: Runtime App Skeletons

**Files:**
- Create: `src/apps/web/*`
- Create: `src/apps/api/*`
- Create: `src/apps/worker/*`

- [ ] Create a minimal Chinese Next.js App Router page for `web` with centralized copy.
- [ ] Create a Hono API app with `/health` returning a typed non-secret health payload and `X-Request-Id`.
- [ ] Create a worker entrypoint with typed lifecycle start/stop helpers and structured startup/shutdown logs.
- [ ] Add smoke tests for web copy, API health response, and worker lifecycle helpers.

### Task 4: Local Development Operations

**Files:**
- Create: `compose.yaml`
- Create: `.env.example`
- Create: `src/apps/*/.env.example` where useful
- Create or modify: `README.md`

- [ ] Define local infrastructure services for PostgreSQL with pgvector, Redis, Meilisearch, and MinIO.
- [ ] Use non-secret local defaults only in examples.
- [ ] Document `pnpm install`, local infrastructure startup, app startup, quality checks, and bootstrap scope.
- [ ] Include notes that production deployment, migrations, auth, RAG, and ingestion behavior are intentionally out of scope.

### Task 5: Verification

**Files:**
- Modify as needed based on verification output.

- [ ] Run dependency install locally with lifecycle scripts disabled.
- [ ] Run `pnpm typecheck`.
- [ ] Run `pnpm lint`.
- [ ] Run `pnpm test`.
- [ ] Run `pnpm build`.
- [ ] Run `pnpm test:e2e` if browser binaries are available; otherwise record the exact blocker.
- [ ] Re-read the PRD acceptance criteria and mark any remaining gaps before final reporting.
