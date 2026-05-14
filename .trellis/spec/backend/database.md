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

