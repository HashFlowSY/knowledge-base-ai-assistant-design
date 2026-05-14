# Backend Guidelines

These guidelines apply to `src/apps/api`, `src/apps/worker`, and backend-focused packages under `src/packages/*`.

## Stack

- Hono API on Node.js
- Hono RPC and OpenAPI output for API contracts
- Better Auth for authentication
- Drizzle ORM and PostgreSQL
- pgvector for vector search
- Meilisearch for keyword search
- Redis and BullMQ for queues
- Structured logging and OpenTelemetry

## Documents

| File | Purpose |
| --- | --- |
| [database.md](./database.md) | Drizzle and PostgreSQL rules |
| [logging.md](./logging.md) | Structured logging and observability |
| [observability.md](./observability.md) | Tracing, metrics, correlation, and redaction rules |
| [audit.md](./audit.md) | Audit event, metadata, and query rules |
| [performance.md](./performance.md) | Parallelism, concurrency limits, caching, and retries |
| [api-module.md](./api-module.md) | Hono API module organization |
| [api-contract.md](./api-contract.md) | HTTP, Hono RPC, OpenAPI, and error contract rules |
| [package-boundaries.md](./package-boundaries.md) | App/package ownership and dependency direction |
| [worker-queue.md](./worker-queue.md) | BullMQ worker, job, retry, and idempotency rules |
| [rag-ingestion.md](./rag-ingestion.md) | Ingestion and RAG pipeline rules |
| [ai-provider.md](./ai-provider.md) | Chat, embedding, rerank provider integration rules |
| [security.md](./security.md) | Authentication and token security rules |
| [storage.md](./storage.md) | MinIO/S3-compatible object storage rules |
| [timestamps.md](./timestamps.md) | PostgreSQL, API, log, and UI timestamp rules |

## Core Rules

- API handlers own HTTP concerns: request parsing, authentication context, validation, authorization, error mapping, and package orchestration.
- Domain logic belongs in `src/packages/*`.
- Every API input and output boundary must be validated or typed through the shared contract.
- Admin-only operations must enforce authorization on the server, not only in the UI.
- Tenant and knowledge-base filters must be applied before retrieval results are returned.
- Queue workers must be idempotent or safely retryable.
- API routes should be grouped by business domain, with schemas and reusable logic colocated with the domain owner.
- Request context middleware should run before route handlers so every request has a `requestId` and logger.
