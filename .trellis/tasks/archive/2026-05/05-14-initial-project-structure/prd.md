# Build Initial Project Structure

## Goal

Build the initial repository structure for the enterprise knowledge-base AI assistant so later Trellis tasks can implement product features inside stable app, package, configuration, and quality-check boundaries.

## What I Already Know

- The project has been initialized with Trellis and initial specs, but application source directories have not been created yet.
- The project is a TypeScript-first monorepo and should use `pnpm` as the package manager.
- The web app should use Next.js 16 with React 19.2.
- The approved product architecture is a modular monolith plus an independent worker:
  - `src/apps/web` for the Next.js management and chat UI.
  - `src/apps/api` for the Hono API, authentication context, management APIs, chat APIs, and OpenAPI output.
  - `src/apps/worker` for BullMQ ingestion jobs.
  - `src/packages/*` for domain and infrastructure packages.
- Initial packages from the design doc:
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
- Apps may depend on packages; core domain logic belongs in packages, not in app entrypoints.
- Shared specs require strict TypeScript, no `any`, no non-null assertions, no `console.log` in production code, Zod at external-input boundaries, and project scripts for lint/typecheck/build/tests.
- The existing repository currently contains Trellis configuration, agent configuration, `package.json`, `pnpm-lock.yaml`, `node_modules`, and the design doc under `docs/superpowers/specs/`.

## Assumptions

- The user selected the **Full local-dev bootstrap** scope.
- This task should establish the monorepo skeleton, baseline tooling, local infrastructure, and minimal runnable app/worker entrypoints, not implement product features such as authentication, RAG, ingestion, or UI flows.
- The skeleton should make future package boundaries explicit through package names, entrypoints, TypeScript project references, and scripts.
- The initial scaffold should prefer lightweight placeholder implementations that compile over empty directories that cannot be checked.
- Local infrastructure definitions should include the project baseline services from the design doc: PostgreSQL with pgvector support, Redis, Meilisearch, and MinIO.

## Requirements

- Create the initial app and package directory layout described in the product design.
- Configure `pnpm` workspaces for apps and packages.
- Configure TypeScript in strict mode across the workspace.
- Add root scripts for at least:
  - `dev`
  - `build`
  - `typecheck`
  - `lint`
  - `test`
- Add Turborepo configuration if the selected scaffold depth includes cross-package task orchestration.
- Add minimal package metadata and typed entrypoints so packages can be imported by later tasks.
- Add a Docker Compose local-development scaffold for PostgreSQL, Redis, Meilisearch, and MinIO.
- Add `.env.example` files or equivalent configuration examples for local development without committing secrets.
- Add a minimal API health endpoint and worker health/lifecycle entrypoint suitable for local smoke checks.
- Add Vitest and Playwright scaffolding so future tasks have clear places for unit, integration, and E2E tests.
- Add basic documentation for starting local infrastructure and running the workspace checks.
- Keep application code minimal and focused on bootstrapping; avoid implementing product behavior in this task.
- Preserve Trellis files and existing docs.
- Do not globally install dependencies or run unapproved initialization scripts.

## Acceptance Criteria

- [ ] `src/apps/web`, `src/apps/api`, and `src/apps/worker` exist with package metadata and minimal typed entrypoints.
- [ ] Every initial `src/packages/*` package exists with package metadata and a minimal typed public entrypoint.
- [ ] `pnpm-workspace.yaml` includes the app and package workspaces.
- [ ] Root `package.json` exposes consistent scripts for development and quality checks.
- [ ] TypeScript strict configuration exists and is shared by apps/packages.
- [ ] Package names and dependency boundaries make the intended architecture clear.
- [ ] Local Docker Compose services are defined for PostgreSQL/pgvector, Redis, Meilisearch, and MinIO.
- [ ] Local env examples describe required ports, credentials, database URL, Redis URL, Meilisearch URL/key, MinIO credentials, and app secrets.
- [ ] API exposes a minimal health endpoint.
- [ ] Worker has a minimal typed entrypoint that can start and shut down without running ingestion jobs.
- [ ] Vitest and Playwright config files exist with placeholder/smoke coverage appropriate for the bootstrap stage.
- [ ] `pnpm typecheck` runs successfully after dependencies are available.
- [ ] `pnpm lint` and `pnpm test` are either runnable successfully or intentionally scaffolded with documented bootstrap behavior.

## Definition Of Done

- Requirements are confirmed.
- Implementation follows relevant `.trellis/spec` backend, frontend, shared, testing, and ops guidance.
- Lint/typecheck/build/test commands are added or explicitly marked as blocked by missing dependencies.
- The final structure is documented enough for future Trellis tasks to place code correctly.
- No unrelated files or user changes are reverted.

## Out Of Scope

- Implementing authentication flows, database schema, migrations, RAG retrieval, ingestion pipeline, provider integrations, audit logging, or real UI pages.
- Building production Docker Compose deployment beyond local-development service definitions.
- Adding Kubernetes, HA, multi-node deployment, or large-scale cluster concerns.
- Adding DOCX/XLSX/CSV/PPTX parsing.
- Adding multi-language UI or custom role management.

## Technical Notes

- Source design: `docs/superpowers/specs/2026-05-12-knowledge-base-ai-assistant-design.md`.
- Relevant specs:
  - `.trellis/spec/shared/index.md`
  - `.trellis/spec/backend/index.md`
  - `.trellis/spec/frontend/index.md`
  - `.trellis/spec/testing/index.md`
  - `.trellis/spec/ops/index.md`
- This task is currently in planning. Implementation should not begin until the scaffold depth is confirmed and the task is started.

## Open Questions

- Confirm the final bootstrap design before implementation starts.

## Selected Approach

Full local-dev bootstrap:

- Monorepo and package boundaries:
  - Configure `pnpm` workspaces and Turborepo.
  - Create minimal runnable app packages under `src/apps/*`.
  - Create typed placeholder domain/infrastructure packages under `src/packages/*`.
- Tooling:
  - Add strict shared TypeScript config.
  - Add ESLint, Prettier, Vitest, and Playwright configuration.
  - Add root scripts for `dev`, `build`, `typecheck`, `lint`, `test`, `test:integration`, `test:e2e`, `db:migrate`, and `db:generate`.
- Local infrastructure:
  - Add local Docker Compose services for PostgreSQL/pgvector, Redis, Meilisearch, and MinIO.
  - Add non-secret env examples and startup documentation.
- Runtime smoke surface:
  - Web app has a minimal Chinese landing/status page.
  - API has a minimal health endpoint and typed app export.
  - Worker has a minimal lifecycle entrypoint and health log through the project logger.
- Scope guard:
  - No real authentication, database schema, ingestion, RAG, provider key management, or production deployment automation in this task.
