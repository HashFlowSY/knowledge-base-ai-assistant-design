# Shared Engineering Guidelines

These rules apply to all apps and packages in this project.

## Scope

- Applies to `src/apps/web`, `src/apps/api`, `src/apps/worker`, and `src/packages/*`.
- Prefer TypeScript with `strict` mode for JavaScript and TypeScript work.
- Use `pnpm` for package management.
- Keep domain logic in `src/packages/*`; apps orchestrate framework concerns and package calls.

## Documents

| File | Purpose |
| --- | --- |
| [code-quality.md](./code-quality.md) | Mandatory code quality rules |
| [typescript.md](./typescript.md) | TypeScript and schema conventions |
| [config.md](./config.md) | Environment configuration validation and secret redaction |

## Core Rules

- Do not use `any` in new code. Use precise types or `unknown` with explicit narrowing.
- Do not use non-null assertions (`!`). Narrow values before use.
- Do not use `@ts-ignore` or `@ts-expect-error`. Fix the source type instead.
- Do not leave `console.log` in production code. Use the project logger.
- Use Zod schemas for API and external-input boundaries.
- Import or infer shared types from the owner package. Do not redefine cross-layer types.
- Remove dead code, unused imports, and commented-out implementation blocks.

## Commit Checks

Before committing implementation work, run the applicable checks:

- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`
- Relevant unit, integration, or E2E tests for the changed area

If the repository is still in bootstrap and one of these scripts does not exist in
`package.json`, do not treat the missing script as passing. Either add the script
as part of the bootstrap work or record the command as blocked until the project
scaffold defines it.
