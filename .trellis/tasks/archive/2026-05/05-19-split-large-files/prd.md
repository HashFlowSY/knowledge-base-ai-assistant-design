# 拆分当前项目较大的文件

## Goal

降低当前项目中体量较大、职责较集中的源码文件的维护成本。拆分应优先保持现有行为、导出契约和测试结果不变，通过更清晰的模块边界让后续开发更容易定位逻辑、补充测试和复用代码。

## What I Already Know

* 用户希望创建一个任务，目的是拆分当前项目较大的文件。
* 用户确认预期是结构拆分，不应影响业务逻辑；`cross-layer top candidates` 只表示从前端、API、领域包、测试等层里挑选最高价值的大文件候选，不表示要改跨层业务流程。
* 项目是 pnpm monorepo，根脚本包括 `pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm build`。
* 项目使用 TypeScript，包含 `src/apps/web`、`src/apps/api`、`src/apps/worker` 和多个 `src/packages/*` 包。
* 初步源码体量扫描已排除 `node_modules`、构建产物、coverage、`.next`、`test-results` 等生成目录。
* 当前源码中行数较高的候选文件包括：
  * `src/apps/web/src/features/mock/store.tsx`，约 1119 行
  * `src/apps/api/src/app.test.ts`，约 1057 行
  * `src/apps/api/src/app.ts`，约 1002 行
  * `src/packages/users/src/service.ts`，约 796 行
  * `src/apps/web/src/features/workspace/workspace-mvp-page.tsx`，约 532 行
  * `src/apps/web/src/features/mock/store.test.ts`，约 525 行
  * `src/apps/web/src/features/mock/seed.ts`，约 502 行
  * `src/apps/web/src/features/chat/chat-page.tsx`，约 486 行
* Relevant project guidance exists under `.trellis/spec/`, especially shared TypeScript/code-quality, frontend component/state guidance, backend API/package-boundary guidance, and testing strategy.

## Assumptions (Temporary)

* This is a refactor-only task: no user-facing feature changes, no API contract changes, and no database schema changes.
* Allowed code changes are limited to moving code, extracting cohesive modules, preserving or adding internal exports, and updating imports/tests to point at the new module boundaries.
* Generated artifacts and dependency directories are not valid split targets.
* The first implementation pass should focus on a small, high-value set of files rather than trying to split every large file in the repository.
* File splitting should preserve existing public imports where practical, using re-export barrels only when they match existing project style and do not hide ownership.

## Scope Decision

* MVP uses the conservative backend/domain set: `api/app.ts` and `users/service.ts`.
* `src/apps/web/src/features/mock/*` is explicitly excluded from this implementation pass.
* Test-file splits are allowed only where they are directly needed for the selected targets or materially improve verification readability.

## Refactor Safety Contract

* The refactor must not change:
  * API paths, HTTP methods, response schemas, status codes, or error copy.
  * Authentication, authorization, rate-limit, tenant, or role semantics.
  * Mock data state transitions, local-storage keys, route access rules, or seeded demo data values.
  * UI text, layout, navigation behavior, or visible loading/empty/error states.
  * Database schema, query semantics, or audit event content.
* The refactor may change:
  * File locations for private helpers.
  * Internal module names and relative import paths.
  * Internal exports needed to connect split modules.
  * Test file organization, as long as tested behavior remains the same.

## Candidate Impact Map

* `src/apps/api/src/app.ts`
  * Current responsibilities: API env/service interfaces, Hono app creation, route registration, health schema, auth proxy routes, user management routes, default service stubs, admin-session guard, rate-limit helpers, validation helpers, and error response helpers.
  * Expected split shape: app facade, contracts/types, default service adapters, auth/session guards, rate-limit helpers, response/validation helpers, and route modules grouped by business domain.
  * Logic expectation: preserve route registration order and every externally observable HTTP contract.
* `src/packages/users/src/service.ts`
  * Current responsibilities: service factory, user listing and mutations, query predicates, user/membership lookups, auth mutation repository, audit insert, default tenant/session resolution, update-field planning, user summary mapping, plan helpers, and service error conversion.
  * Expected split shape: service facade, query helpers, mutation repository helpers, audit helpers, session resolution helpers, mutation plan helpers, mappers, and error helpers.
  * Logic expectation: preserve public service API and all query/mutation semantics.
* Test files such as `src/apps/api/src/app.test.ts` and `src/apps/web/src/features/mock/store.test.ts`
  * Expected split shape: only split API/users tests by behavior area when it improves maintainability or when imports need to follow the new modules. Mock store tests should remain unchanged unless needed to verify non-mock edits.
  * Logic expectation: tests should describe the same behavior; they are a safety net for the refactor, not a behavior rewrite.
* Files such as `src/apps/web/src/features/mock/seed.ts`
  * Expected handling: out of scope for this implementation pass.

## Requirements (Evolving)

* Identify large source files by line count and responsibility concentration, excluding generated files and third-party dependencies.
* Prioritize files whose size reflects mixed responsibilities, not files that are long only because they contain static fixtures or straightforward test cases.
* Split selected files into focused modules with clear ownership:
  * UI components, layout helpers, data/state hooks, fixtures, and type definitions should live in separate files when appropriate.
  * API route composition, middleware setup, schemas, handlers, and test fixtures should be separated when appropriate.
  * Domain package services should separate validation, repository orchestration, policy checks, and pure helpers when appropriate.
* Preserve existing behavior, exports, route contracts, UI copy, and tests unless a specific change is approved later.
* Prefer keeping existing public entry-point imports stable; for example, consumers that import from `../mock/store` or package public APIs should continue to work unless the PRD is updated to approve a migration.
* Keep imports type-safe and avoid circular dependencies.
* Update tests only where import paths or module boundaries change.
* Do not introduce new runtime dependencies solely for this refactor.
* Use pnpm for project commands.

## Acceptance Criteria (Evolving)

* [ ] A final candidate list is documented before implementation starts.
* [ ] Each selected large file is split into smaller files with cohesive responsibilities.
* [ ] Existing public entry points continue to work or are intentionally migrated with all internal imports updated.
* [ ] No generated files, dependency files, or build artifacts are modified as refactor targets.
* [ ] Relevant unit/integration tests are updated or preserved.
* [ ] `pnpm typecheck` passes.
* [ ] `pnpm lint` passes.
* [ ] Relevant tests pass; broader `pnpm test` should run if the touched scope is broad.

## Definition of Done (Team Quality Bar)

* Tests added/updated where module boundaries or import paths change.
* Lint / typecheck / relevant tests are green.
* No behavior, copy, API contract, or schema change is introduced without explicit approval.
* Refactor boundaries align with `.trellis/spec/` package and layer guidance.
* Docs/notes updated if the refactor establishes a reusable convention.

## Out of Scope

* New product features.
* UI redesign.
* API contract changes.
* Database migrations.
* Replacing the framework, state library, router, test runner, or package manager.
* Broad formatting-only churn unrelated to the selected files.

## Technical Notes

* Current task directory: `.trellis/tasks/05-19-split-large-files`.
* Initial scan command:

```bash
find . -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.jsx' -o -name '*.css' \) \
  -not -path './node_modules/*' \
  -not -path './dist/*' \
  -not -path './build/*' \
  -not -path './coverage/*' \
  -not -path './src/apps/web/.next/*' \
  -not -path './.next/*' \
  -not -path './test-results/*' \
  -not -path './playwright-report/*' \
  -not -path './.trellis/*' \
  -print0 | xargs -0 wc -l | sort -nr | head -40
```

* Specs likely relevant for implementation:
  * `.trellis/spec/shared/index.md`
  * `.trellis/spec/shared/typescript.md`
  * `.trellis/spec/shared/code-quality.md`
  * `.trellis/spec/frontend/index.md`
  * `.trellis/spec/frontend/component-guidelines.md`
  * `.trellis/spec/frontend/state-management.md`
  * `.trellis/spec/frontend/quality-guidelines.md`
  * `.trellis/spec/backend/index.md`
  * `.trellis/spec/backend/api-module.md`
  * `.trellis/spec/backend/package-boundaries.md`
  * `.trellis/spec/testing/index.md`
  * `.trellis/spec/testing/strategy.md`
