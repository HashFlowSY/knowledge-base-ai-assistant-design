# Configuration Guidelines

These rules define environment and runtime configuration.

## Ownership

- `src/packages/config` owns config schemas, parsing, defaults, and redaction.
- Apps call config loaders at startup.
- Packages receive typed config objects or narrow values; they do not parse `process.env` directly.

## Validation

Validate configuration with schemas at service startup.

Required config groups:

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

