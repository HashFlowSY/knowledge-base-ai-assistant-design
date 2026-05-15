# Database Guidelines

## Avoid N+1 Queries

Do not `await` database queries inside loops when a batch query is possible.

Bad:

```typescript
for (const document of documents) {
  const chunks = await db
    .select()
    .from(chunksTable)
    .where(eq(chunksTable.documentId, document.id));
}
```

Good:

```typescript
const documentIds = documents.map((document) => document.id);
const chunks = await db
  .select()
  .from(chunksTable)
  .where(inArray(chunksTable.documentId, documentIds));
```

## Batch Writes

Use batch inserts and upserts for multiple records.

```typescript
await db.insert(chunksTable).values(chunkRows);
```

Use conflict handling for idempotent ingestion steps.

```typescript
await db
  .insert(documentSourcesTable)
  .values(sourceRows)
  .onConflictDoUpdate({
    target: [documentSourcesTable.documentId, documentSourcesTable.sourceHash],
    set: {
      updatedAt: sql`NOW()`,
    },
  });
```

## Transactions

Use transactions when a workflow updates multiple tables that must stay consistent.

Examples:

- Create document, source record, ingestion job, and audit log.
- Write chunks and embeddings for the same document version.
- Update provider config and secret metadata.

Every operation inside the transaction must use the transaction object, not the global `db`.

## Select Only Needed Columns

Avoid selecting large fields when list pages only need summaries.

Examples of fields to avoid on list pages unless needed:

- Full document text.
- Chunk content.
- Prompt content.
- Full model responses.
- Encrypted provider secret payloads.

## PostgreSQL JSON and JSONB

When using raw SQL JSON operations, cast to `jsonb` explicitly when required.

```typescript
await db
  .select()
  .from(auditLogsTable)
  .where(sql`${auditLogsTable.metadata}::jsonb ? 'providerId'`);
```

## Raw SQL Identifiers

Double-quote camelCase identifiers in raw SQL.

```typescript
await db.execute(sql`
  UPDATE "ingestionJob"
  SET "updatedAt" = NOW()
  WHERE "documentId" = ${documentId}
`);
```

Prefer snake_case database identifiers when practical to reduce quoting needs.

## Enum Comparisons

When comparing PostgreSQL enum columns in raw SQL, cast enum columns to text if direct comparison is unreliable.

```typescript
await db.execute(sql`
  SELECT *
  FROM "ingestion_jobs"
  WHERE status::text != 'completed'
`);
```

Use Drizzle query builder comparisons when possible.

## Indexes

Add indexes that match query patterns.

Expected high-value indexes:

- Tenant-scoped tables: `tenant_id`.
- Knowledge-base scoped tables: `tenant_id`, `knowledge_base_id`.
- Ingestion jobs: status, created time, document id.
- Audit logs: tenant id, actor id, action, created time.
- Retrieval metadata: chat session id, message id, run id.
- Vector search: pgvector index appropriate to embedding type and distance metric.

## Initial Drizzle Schema and Migration Contract

### 1. Scope / Trigger

- Trigger: database schema or migration work in `src/packages/db`.
- The `@kb/db` package owns Drizzle table definitions, migration configuration, generated SQL migrations, and the migration runner.

### 2. Signatures

- Config file: `src/packages/db/drizzle.config.ts`.
- Schema entrypoint: `src/packages/db/src/schema/index.ts`.
- Migration output directory: `src/packages/db/drizzle/`.
- Migration command: `pnpm db:migrate`.
- Generation command: `pnpm db:generate`.

### 3. Contracts

- Schema files are split by domain: auth, tenant, knowledge, ingestion, RAG, provider, audit, and system.
- Database identifiers use snake_case; TypeScript fields use camelCase.
- Migration runner and Drizzle config load `.env` first. They may load `.env.example` only outside production as a local bootstrap fallback.
- Better Auth table fields are schema ownership only; auth runtime must still enforce token hashing/encryption requirements before writing session, verification, OAuth, or reset tokens.
- Initial migrations that use UUID defaults and pgvector must ensure these extensions exist before dependent DDL:
  - `pgcrypto`
  - `vector`
- Composite foreign keys must reference an existing primary key or unique index. If a tenant-scoped FK references `(tenant_id, id)`, the referenced table must define the matching `(tenant_id, id)` unique index and the SQL migration must create that index before adding the FK.
- Schema changes and generated migration snapshots must stay in sync. After renaming Drizzle columns or adding/removing indexes, `pnpm db:generate` must run non-interactively with `No schema changes, nothing to migrate` before the task is considered checked.
- `chunk_embeddings.embedding` uses the Production v1 default `vector(1024)`.
- Embedding rows must also store `provider_id`, `model_id`, and `dimensions` so future model changes can be handled by explicit migration plus re-embedding.

### 4. Validation & Error Matrix

- Missing `DATABASE_URL` -> migration runner fails during config parsing.
- Production missing `DATABASE_URL` -> migration runner fails instead of falling back to `.env.example`.
- PostgreSQL unavailable -> migration runner fails before DDL and must not report `ready`.
- Missing `vector` extension -> migration fails when creating vector columns or indexes.
- Tenant-scoped composite FK references a table without a matching unique index -> PostgreSQL fails migration with `there is no unique constraint matching given keys`.
- Migration SQL adds a composite FK before creating the referenced unique index -> fresh `pnpm db:migrate` fails even if `drizzle-kit check` reports the migration files are internally valid.
- Drizzle schema differs from the latest snapshot -> `pnpm db:generate` either creates a new migration or prompts for conflict resolution; this is not a passing no-op check.
- Embedding model dimension changes -> add a new migration and re-embedding workflow; do not mix incompatible vector dimensions in the same pgvector column.

### 5. Good/Base/Bad Cases

- Good: `pnpm db:generate` creates SQL under `src/packages/db/drizzle/`, and `pnpm db:migrate` applies it to local Compose PostgreSQL.
- Good: tenant-scoped tables that are referenced by `(tenant_id, <id>)` foreign keys expose matching unique indexes before those FKs are added.
- Base: schema-only changes still update package tests for public exports and constants.
- Bad: relying on `drizzle-kit check` alone; it can pass while a fresh PostgreSQL migration still fails because SQL statement order is invalid.
- Bad: running Better Auth CLI migrations separately from Drizzle migrations, which splits foundational schema ownership.

### 6. Tests Required

- Unit tests assert schema registry exports and database constants such as vector dimensions.
- Typecheck must pass for `@kb/db`.
- Lint must pass for `@kb/db`.
- `pnpm db:generate` must complete as a no-op after intended migration files are generated.
- Local migration verification should run against Compose PostgreSQL when a migration file changes.

### 7. Wrong vs Correct

#### Wrong

```typescript
export const chunkEmbeddings = pgTable("chunk_embeddings", {
  embedding: vector("embedding", { dimensions: 1536 }).notNull(),
});
```

This hard-codes an unrecorded model assumption and gives future code no way to identify which provider/model produced the vector.

#### Correct

```typescript
export const chunkEmbeddings = pgTable("chunk_embeddings", {
  providerId: uuid("provider_id"),
  modelId: varchar("model_id", { length: 200 }).notNull(),
  dimensions: integer("dimensions").notNull().default(1024),
  embedding: vector("embedding", { dimensions: 1024 }).notNull(),
});
```

This keeps the physical pgvector column fixed for Production v1 while preserving model metadata for future migrations.

#### Wrong

```sql
ALTER TABLE "ingestion_jobs"
  ADD CONSTRAINT "ingestion_jobs_tenant_kb_fk"
  FOREIGN KEY ("tenant_id", "knowledge_base_id")
  REFERENCES "knowledge_bases"("tenant_id", "id");

CREATE UNIQUE INDEX "knowledge_bases_tenant_id_id_idx"
  ON "knowledge_bases" ("tenant_id", "id");
```

This creates the FK before PostgreSQL has a unique referenced key, so a fresh migration fails.

#### Correct

```sql
CREATE UNIQUE INDEX "knowledge_bases_tenant_id_id_idx"
  ON "knowledge_bases" ("tenant_id", "id");

ALTER TABLE "ingestion_jobs"
  ADD CONSTRAINT "ingestion_jobs_tenant_kb_fk"
  FOREIGN KEY ("tenant_id", "knowledge_base_id")
  REFERENCES "knowledge_bases"("tenant_id", "id");
```

Create referenced unique keys before composite foreign keys that depend on them.
