# Configuration Guidelines

These rules define environment and runtime configuration.

## Ownership

- `src/packages/config` owns config schemas, parsing, defaults, and redaction.
- Apps call config loaders at startup.
- Packages receive typed config objects or narrow values; they do not parse `process.env` directly.

## Validation

Validate configuration with schemas at service startup.

Required config groups:

- API server port
- app URLs and public origins
- database
- Redis
- Meilisearch
- object storage
- Better Auth
- encryption
- provider defaults
- rate limits
- worker concurrency
- log level

Fail fast if required values are missing or invalid.

## Secrets

Secrets include:

- database URLs
- Redis passwords
- Meilisearch keys
- object storage access keys
- Better Auth secret
- `APP_ENCRYPTION_KEY`
- provider API keys

Secrets must be redacted in logs, health endpoints, and config dumps.

## Environment Access

Only config loaders should read `process.env`.

Allowed:

```typescript
const config = loadApiConfig(process.env);
```

Avoid:

```typescript
const databaseUrl = process.env.DATABASE_URL;
```

inside domain packages, provider adapters, or route handlers.

## Defaults

Defaults are allowed only for non-secret, non-production-sensitive settings.

Examples:

- log level in development
- local service hostnames
- page size defaults
- conservative worker concurrency

Do not default secrets in production.

## Public vs Private Config

Frontend public config must be explicitly selected.

Never expose:

- provider keys
- object storage credentials
- database URLs
- encryption keys
- Better Auth secret

Public config may include:

- app name
- public API base URL
- public feature flags
- upload size display limits

## Encryption Key

`APP_ENCRYPTION_KEY` must:

- be required in production.
- have validated length/format.
- be unavailable to frontend code.
- be used only through security/secret helper APIs.

Key rotation is not required for Production v1, but the storage format should leave room for key version metadata.

## Scenario: API server port configuration

### 1. Scope / Trigger

- Trigger: any API server startup code that chooses the HTTP listen port.
- Owner: `src/packages/config` owns the port schema, default, parsing, and redacted config output.

### 2. Signatures

- Environment key: `PORT`.
- Runtime config field: `RuntimeConfig["PORT"]: number`.
- Default constant: `defaultApiPort = 4000`.

### 3. Contracts

- `PORT` is optional in local development and defaults to `4000`.
- `PORT` must parse as an integer between `1` and `65535`.
- `src/apps/api/src/server.ts` may call `loadRuntimeConfig(process.env)` at startup and then pass `config.PORT` to `serve`.
- API routes, domain packages, provider adapters, and queue/storage packages must not parse `process.env.PORT` directly.

### 4. Validation & Error Matrix

| Condition | Required outcome |
| --- | --- |
| `PORT` missing | Use `4000` |
| `PORT="4100"` | Runtime config returns `4100` |
| `PORT` is non-numeric, zero, negative, or above `65535` | Config parsing fails at startup |

### 5. Good/Base/Bad Cases

- Good: `const config = loadRuntimeConfig(process.env); serve({ port: config.PORT })`.
- Base: package tests call `loadRuntimeConfig({ ...env, PORT: "4100" })`.
- Bad: `Number.parseInt(process.env.PORT ?? "4000", 10)` in an app entrypoint.

### 6. Tests Required

- Config unit tests assert default and override behavior.
- API server changes that touch startup config must run API/web typecheck or build as applicable.

### 7. Wrong vs Correct

#### Wrong

```typescript
const port = Number.parseInt(process.env.PORT ?? "4000", 10);
```

#### Correct

```typescript
const config = loadRuntimeConfig(process.env);
serve({ fetch: app.fetch, port: config.PORT });
```
