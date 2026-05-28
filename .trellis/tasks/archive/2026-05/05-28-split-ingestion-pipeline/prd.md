# 拆分 Ingestion 管线

## Goal

将 `src/packages/ingestion/src/index.ts` 中混杂的解析、分块、管线编排、持久化 repository、恢复逻辑拆分为按功能归并的模块目录，降低单文件复杂度，同时保持现有外部 API、运行行为和测试语义不变。

## What I Already Know

- 目标超长文件：
  - `src/packages/ingestion/src/index.ts`，1181 行。
  - `src/packages/ingestion/src/index.test.ts`，448 行。
- 直接消费者：
  - `src/apps/worker/src/index.ts` 从 `@kb/ingestion` 导入 `createDrizzleIngestionRepository`、`createIngestionPipeline`、`recoverIngestionJobs`。
  - `src/packages/ingestion/src/index.test.ts` 覆盖 parser、chunker、pipeline、embedding batch、claim/recovery 行为。
- 当前公开入口：
  - `parseDocument`
  - `normalizeParsedText`
  - `chunkParsedDocument`
  - `createIngestionPipeline`
  - `createDrizzleIngestionRepository`
  - `recoverIngestionJobs`
  - schema/type/error exports
- Trellis backend spec 约束：
  - `src/packages/ingestion` owns ingestion pipeline orchestration。
  - 固定步骤是 source connector、parser、normalizer、chunker、embedding、index writer。
  - 每步应有 typed input/result，记录 step 状态，不能在日志泄露全文内容，同 document version 应 retry-safe。
  - queue worker must tolerate retries and avoid duplicate chunks/embeddings/search docs.
- 用户明确要求：
  - 创建任务。
  - 开始任务前再次明确影响范围。
  - 不清楚的决策直接问，禁止模糊开始。
  - 使用 sub agent 时必须显式声明其为 sub agent，只专注当前任务，完成后返回；若可能与其他 agent 冲突，直接结束并返回原因。
  - 拆分后的文件必须按功能归并到相应文件夹，不直接散放在 package 根目录。

## Impact Scope

### In Scope

- 拆分 `src/packages/ingestion/src/index.ts` 为功能目录内的文件。
- 让 `src/packages/ingestion/src/index.ts` 保持为 public barrel/re-export 入口，避免 worker 和其他包改 import path。
- 拆分或整理 `src/packages/ingestion/src/index.test.ts`，测试文件也按功能放入目录，而不是继续集中在根目录。
- 更新 package 内部 import，使拆分后的模块互相引用清晰。
- 保持现有 public exports 和运行行为不变。
- 运行并修复相关测试、typecheck/lint 中由本拆分引起的问题。

### Out of Scope

- 不改变 ingestion pipeline 业务行为。
- 不改变 BullMQ payload contract。
- 不改变 `src/apps/worker` 的业务逻辑。
- 不改数据库 schema、migration、Drizzle table 定义。
- 不引入新依赖。
- 不实现 URL ingestion、OCR、embedding 去重等新功能。

## Proposed Module Layout

所有新增文件都放在功能目录中：

```text
src/packages/ingestion/src/
  index.ts
  contracts/
    errors.ts
    schemas.ts
    types.ts
  parsing/
    parser.ts
    pdf.ts
    text.ts
  chunking/
    chunker.ts
    boundaries.ts
  pipeline/
    pipeline.ts
    embedding-batches.ts
    steps.ts
  repositories/
    drizzle.ts
    mappers.ts
  recovery/
    recovery.ts
  tests/
    parsing.test.ts
    chunking.test.ts
    pipeline.test.ts
```

Notes:

- `index.ts` remains a narrow barrel file.
- `contracts/` owns exported schemas, shared interfaces, and `IngestionError`.
- `parsing/` owns format detection, text/PDF extraction, and normalization.
- `chunking/` owns chunk generation, source locators, token/hash estimation, and boundary helpers.
- `pipeline/` owns `createIngestionPipeline`, step recording/failure normalization, and embedding batching.
- `repositories/` owns Drizzle repository and row/payload mapping.
- `recovery/` owns `recoverIngestionJobs`.
- `tests/` keeps ingestion package tests grouped by behavior.

## Requirements

- Preserve all currently exported names from `@kb/ingestion`.
- Preserve all currently passing behavior in ingestion tests.
- Preserve worker imports from `@kb/ingestion`; no consumer should need to import internal subpaths.
- Keep internal helper exports minimal; only export helpers needed across functional directories.
- Keep type-only imports as `import type`.
- Do not use `any`, non-null assertions, `@ts-ignore`, or `@ts-expect-error`.
- Do not add production logging or change existing error messages unless required by the refactor.
- Do not place split files directly under `src/packages/ingestion/src/` except `index.ts`.

## Acceptance Criteria

- [ ] `src/packages/ingestion/src/index.ts` is reduced to a small barrel file.
- [ ] No new implementation file is placed directly under `src/packages/ingestion/src/`.
- [ ] Parser, chunker, pipeline, repository, and recovery responsibilities are separated by directory.
- [ ] `src/apps/worker/src/index.ts` still imports from `@kb/ingestion`.
- [ ] Relevant ingestion tests pass.
- [ ] Typecheck and lint pass, or any environmental blocker is documented with exact command output.

## Definition of Done

- Tests added/updated where file movement changes test organization.
- Relevant test command run.
- `pnpm typecheck` and `pnpm lint` run if scripts are available.
- Trellis check completed after implementation.
- Spec update considered at finish; update only if a reusable convention was learned.

## Technical Notes

- Relevant specs read:
  - `.trellis/spec/backend/rag-ingestion.md`
  - `.trellis/spec/backend/worker-queue.md`
  - `.trellis/spec/backend/package-boundaries.md`
  - `.trellis/spec/shared/typescript.md`
  - `.trellis/spec/shared/code-quality.md`
  - `.trellis/spec/testing/strategy.md`
- Current direct imports found:
  - `src/apps/worker/src/index.ts` imports ingestion package public functions from `@kb/ingestion`.
  - No other production code imports ingestion internals.
- The split should be implemented as a mechanical refactor first, then tested.

## Decisions

- Use option A: strictly follow the proposed directory layout. Even if an individual file is small, keep files grouped by functional directory so module boundaries remain explicit.
