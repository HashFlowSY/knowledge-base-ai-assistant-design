# Deployment and Operations Guidelines

These rules define local development and Production v1 private deployment.

## Deployment Target

Production v1 targets a single machine or single VM using Docker Compose.

The architecture should not block future Kubernetes migration, but Kubernetes is not part of Production v1 delivery.

## Services

Required services:

- `web`: Next.js web app.
- `api`: Hono API service.
- `worker`: BullMQ ingestion worker.
- `postgres`: PostgreSQL with pgvector.
- `redis`: Redis for BullMQ and cache use.
- `meilisearch`: keyword search.
- `minio`: S3-compatible object storage, unless external object storage is configured.

Optional services:

- observability collector/exporter.
- reverse proxy or TLS terminator.

## Configuration

All services must load configuration from environment variables with schema validation.

Required configuration groups:

- App URLs and public origins.
- Database connection.
- Redis connection.
- Meilisearch connection and key.
- Object storage endpoint, bucket names, credentials.
- Better Auth secrets and URLs.
- `APP_ENCRYPTION_KEY`.
- Provider defaults and enabled status.
- Rate limits and concurrency limits.
- Log level.

Configuration validation must run at service startup and fail fast on invalid required values.

Secrets must not be printed in full in logs or health responses.

## Local Development

Local development uses Docker Compose for infrastructure:

- PostgreSQL.
- Redis.
- Meilisearch.
- MinIO.

Node.js and pnpm run application services locally unless a task explicitly targets containerized app services.

Expected local commands:

- `pnpm dev`
- `pnpm build`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `pnpm test:integration`
- `pnpm test:e2e`
- `pnpm db:migrate`
- `pnpm db:generate`

These commands must exist once the application scaffold is present. During
bootstrap, missing scripts must be tracked as setup work rather than treated as
optional operational checks.

## Health Checks

Each runtime service needs health/readiness checks.

API health should check:

- process is alive.
- configuration is valid.
- database connectivity.
- Redis connectivity.
- Meilisearch connectivity.
- object storage connectivity when required.

Worker health should check:

- process is alive.
- Redis connectivity.
- database connectivity.
- queue processor registration.

Health endpoints must not expose secrets.

## Migrations

Database migrations use Drizzle migrations.

Rules:

- Migrations are reviewed and committed.
- Production deploy runs migrations before starting new app version or through an explicit migration step.
- Destructive migrations require backup and rollback notes.
- Migration status must be visible in deployment logs.

## Backup and Restore

Production v1 must document backup and restore for:

- PostgreSQL database.
- MinIO/S3 object data.
- Meilisearch indexes or rebuild procedure.
- Configuration and secrets inventory.

PostgreSQL is the source of truth for business metadata. Meilisearch and pgvector-derived indexes can be rebuilt from documents/chunks when needed, but rebuild time must be documented.

## Retention

Production v1 retention expectations:

- Audit logs are retained indefinitely until a shorter retention policy is explicitly implemented.
- Ingestion job logs are retained long enough for operators to diagnose recent failures and retries.
- Structured application logs follow the deployment log retention policy and must not be the only copy of audit events.
- Temporary object storage data must have an expiration and cleanup path.

If a future release shortens audit retention, the release notes must document the retention period, export path, and access controls before deletion is enabled.

## Upgrade Strategy

Upgrade procedure:

1. Backup database and object storage.
2. Stop or drain worker to avoid mid-ingestion writes.
3. Pull new application version.
4. Run migrations.
5. Start API and web.
6. Start worker.
7. Run health checks.
8. Verify ingestion queue and chat path.

Rollback procedure must describe whether database rollback is supported for the release.

## Logging and Metrics

Production logs must be structured.

Required fields when available:

- `requestId`
- `jobId`
- `tenantId`
- `actorId`
- `action`
- `service`

Metrics/traces should cover:

- API request count, latency, and errors.
- Worker job count, duration, failures, retries.
- Provider latency and error rate.
- Meilisearch and pgvector query latency.
- Object storage operation failures.

## Operational Limits

Configure limits explicitly:

- upload size.
- URL ingestion response size.
- chat request rate.
- provider concurrency.
- worker concurrency.
- database pool size.
- Redis connection count.

Defaults should be conservative for single-VM deployment.

## Scenario: Local middleware reset command

### 1. Scope / Trigger

- Trigger: changing the local development reset workflow for Docker Compose middleware.
- Applies to the root `pnpm dev:reset` command and its implementation under `scripts/`.
- This is a local development-only workflow. It must never reset production or shared environment data.

### 2. Signatures

- Command: `pnpm dev:reset`
- Script entrypoint: `tsx scripts/dev-reset.ts`
- Docker Compose file: `compose.yaml`
- Local Compose services: `postgres`, `redis`, `meilisearch`, `minio`
- Local container names: `kb-postgres`, `kb-redis`, `kb-meilisearch`, `kb-minio`

### 3. Contracts

- The command reads the project root `.env` before doing destructive work.
- Required `.env` values:
  - `NODE_ENV=development`
  - `DATABASE_URL` targets `localhost` or `127.0.0.1` on port `5432`
  - `REDIS_URL` targets `localhost` or `127.0.0.1` on port `6379`
  - `MEILISEARCH_HOST` targets `localhost` or `127.0.0.1` on port `7700`
  - `S3_ENDPOINT` targets `localhost` or `127.0.0.1` on port `9000`
  - `S3_BUCKET` is non-empty
  - `S3_ACCESS_KEY_ID=minioadmin`
  - `S3_SECRET_ACCESS_KEY=minioadmin`
- The command may delete only the current repository's local Compose containers and volumes.
- The command must preserve Docker images.
- The command must recreate the configured MinIO bucket, apply database migrations, seed development auth data, then exit.
- The command must not start `pnpm dev`.

### 4. Validation & Error Matrix

| Condition | Required outcome |
| --- | --- |
| `.env` is missing | Refuse before Docker, migration, seed, or bucket commands |
| `NODE_ENV` is missing or not `development` | Refuse before destructive work |
| Any dependency URL points away from the expected local host/port | Refuse before destructive work |
| MinIO credentials do not match the local Compose defaults | Refuse before destructive work |
| Safety checks pass | Run Compose reset, health wait, bucket creation, migration, and dev seed |
| Middleware health checks do not become healthy | Fail the command before migration and seed |

### 5. Good/Base/Bad Cases

- Good: `pnpm dev:reset` with `.env` pointing to local Compose dependencies deletes local volumes, recreates bucket from `S3_BUCKET`, runs migrations, runs dev seed, and exits.
- Base: `docker compose up -d postgres redis meilisearch minio` remains valid when a developer wants to start services without clearing data.
- Bad: `NODE_ENV=development` with `DATABASE_URL` pointing at a remote host must still be rejected.

### 6. Tests Required

- Unit tests must cover accepted local `.env` values.
- Unit tests must prove non-development `NODE_ENV` is rejected before destructive commands.
- Unit tests must prove remote or wrong-port dependency URLs are rejected.
- Unit tests must prove MinIO bucket and credential validation.
- Unit tests must assert the command plan contains `docker compose down --volumes --remove-orphans` and does not contain image deletion or `pnpm dev`.

### 7. Wrong vs Correct

#### Wrong

```json
{
  "scripts": {
    "dev:reset": "docker compose down -v && docker compose up -d && pnpm db:migrate"
  }
}
```

#### Correct

```json
{
  "scripts": {
    "dev:reset": "tsx scripts/dev-reset.ts"
  }
}
```

The TypeScript entrypoint must run explicit dev and local-dependency safety checks before any destructive command.
