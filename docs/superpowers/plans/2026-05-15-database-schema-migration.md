# Database Schema Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the initial Drizzle/PostgreSQL schema and migration workflow for the knowledge-base AI assistant.

**Architecture:** The `@kb/db` package owns schema definitions, migration configuration, and the migration runner. Schema files are split by domain and exported from a single package entrypoint. The initial migration creates Better Auth-compatible auth tables, tenant/product tables, knowledge ingestion tables, RAG persistence tables, provider/secret tables, audit logs, system settings, and pgvector support with `vector(1024)`.

**Tech Stack:** TypeScript strict, Drizzle ORM, drizzle-kit, PostgreSQL 17 with pgvector, Vitest, pnpm.

---

### Task 1: Public Contract Tests

**Files:**
- Modify: `src/packages/db/src/index.test.ts`

- [ ] **Step 1: Write failing tests for schema exports and migration status**

```typescript
import { describe, expect, it } from "vitest";

import {
  auditLogs,
  databaseConfigSchema,
  databaseMigrationConfigSchema,
  knowledgeBases,
  migrationStatusSchema,
  schema,
  vectorDimensions,
} from "./index";

describe("@kb/db", () => {
  it("validates database configuration", () => {
    expect(
      databaseConfigSchema.parse({
        databaseUrl: "postgres://kb:kb@localhost:5432/kb",
      }),
    ).toMatchObject({
      poolSize: 10,
    });
  });

  it("exports the domain schema registry", () => {
    expect(schema.authUsers).toBeDefined();
    expect(schema.tenants).toBeDefined();
    expect(schema.chunkEmbeddings).toBeDefined();
    expect(schema.auditLogs).toBe(auditLogs);
    expect(knowledgeBases).toBe(schema.knowledgeBases);
  });

  it("uses the initial embedding vector dimension", () => {
    expect(vectorDimensions.chunkEmbedding).toBe(1024);
  });

  it("validates migration configuration", () => {
    expect(
      databaseMigrationConfigSchema.parse({
        databaseUrl: "postgres://kb:kb@localhost:5432/kb",
        migrationsFolder: "drizzle",
      }),
    ).toEqual({
      databaseUrl: "postgres://kb:kb@localhost:5432/kb",
      migrationsFolder: "drizzle",
    });
  });

  it("describes a successful migration status", () => {
    expect(
      migrationStatusSchema.parse({
        status: "ready",
        message: "Migrations applied.",
      }),
    ).toEqual({
      status: "ready",
      message: "Migrations applied.",
    });
  });
});
```

- [ ] **Step 2: Run the package test to verify RED**

Run: `pnpm --filter @kb/db test`

Expected: FAIL because schema exports, vector dimensions, and migration config do not exist yet.

### Task 2: Add Database Dependencies and Configuration

**Files:**
- Modify: `src/packages/db/package.json`
- Create: `drizzle.config.ts`
- Modify: `src/packages/db/src/index.ts`

- [ ] **Step 1: Add runtime dependencies**

Run: `pnpm add drizzle-orm pg dotenv --filter @kb/db`

Run: `pnpm add -D @types/pg --filter @kb/db`

- [ ] **Step 2: Add migration scripts**

Update `src/packages/db/package.json` scripts:

```json
{
  "db:generate": "drizzle-kit generate",
  "db:migrate": "tsx src/migrate.ts"
}
```

Keep the root package scripts unchanged because they already delegate to `@kb/db`.

- [ ] **Step 3: Create drizzle config**

Create `drizzle.config.ts`:

```typescript
import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config();

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for Drizzle migrations.");
}

export default defineConfig({
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
  out: "./src/packages/db/drizzle",
  schema: "./src/packages/db/src/schema/index.ts",
  strict: true,
  verbose: true,
});
```

- [ ] **Step 4: Add migration config schema**

Add `databaseMigrationConfigSchema` to `src/packages/db/src/index.ts`:

```typescript
export const databaseMigrationConfigSchema = z.object({
  databaseUrl: z.string().url(),
  migrationsFolder: z.string().min(1).default("src/packages/db/drizzle"),
});

export type DatabaseMigrationConfig = z.infer<
  typeof databaseMigrationConfigSchema
>;
```

- [ ] **Step 5: Run the package test**

Run: `pnpm --filter @kb/db test`

Expected: still FAIL because schema exports do not exist yet.

### Task 3: Shared Schema Utilities and Auth/Tenant Tables

**Files:**
- Create: `src/packages/db/src/schema/common.ts`
- Create: `src/packages/db/src/schema/auth.ts`
- Create: `src/packages/db/src/schema/tenant.ts`
- Create: `src/packages/db/src/schema/index.ts`
- Modify: `src/packages/db/src/index.ts`

- [ ] **Step 1: Add shared schema helpers**

Create `src/packages/db/src/schema/common.ts` with timestamp helpers, JSONB metadata, and UUID defaults.

- [ ] **Step 2: Add Better Auth-compatible tables**

Create `src/packages/db/src/schema/auth.ts` with `authUsers`, `authSessions`, `authAccounts`, and `authVerifications`.

- [ ] **Step 3: Add tenant and membership tables**

Create `src/packages/db/src/schema/tenant.ts` with `tenants`, `tenantMemberships`, and role enums for `admin`/`member`.

- [ ] **Step 4: Export schema registry**

Create `src/packages/db/src/schema/index.ts` and export `schema` as a single object containing all current tables.

- [ ] **Step 5: Re-export schema from package entrypoint**

Update `src/packages/db/src/index.ts` to export all schema modules and the `schema` object.

- [ ] **Step 6: Run the package test**

Run: `pnpm --filter @kb/db test`

Expected: still FAIL because knowledge, RAG, and audit tables are not complete.

### Task 4: Knowledge, Ingestion, Provider, RAG, Audit, and System Tables

**Files:**
- Create: `src/packages/db/src/schema/knowledge.ts`
- Create: `src/packages/db/src/schema/ingestion.ts`
- Create: `src/packages/db/src/schema/provider.ts`
- Create: `src/packages/db/src/schema/rag.ts`
- Create: `src/packages/db/src/schema/audit.ts`
- Create: `src/packages/db/src/schema/system.ts`
- Modify: `src/packages/db/src/schema/index.ts`

- [ ] **Step 1: Add knowledge tables**

Create `knowledgeBases`, `knowledgeBaseMembers`, `documents`, `documentSources`, `documentChunks`, and `chunkEmbeddings`.

- [ ] **Step 2: Add ingestion tables**

Create `ingestionJobs` and `ingestionJobLogs` with step/status enums and retry metadata.

- [ ] **Step 3: Add provider and secret tables**

Create `providerConfigs` and `secretRecords`, separating provider config metadata from encrypted secret payloads.

- [ ] **Step 4: Add RAG tables**

Create `chatSessions`, `chatMessages`, `retrievalRuns`, `retrievalResults`, `answerCitations`, `answerFeedback`, and citation-feedback join tables where needed.

- [ ] **Step 5: Add audit and system tables**

Create `auditLogs` and `systemSettings` with tenant, actor, action, metadata, and timestamp indexes.

- [ ] **Step 6: Update schema registry exports**

Update `src/packages/db/src/schema/index.ts` to export all domain tables and `vectorDimensions`.

- [ ] **Step 7: Run the package test**

Run: `pnpm --filter @kb/db test`

Expected: PASS.

### Task 5: Migration Runner and Initial Migration

**Files:**
- Modify: `src/packages/db/src/migrate.ts`
- Generate: `src/packages/db/drizzle/*.sql`
- Generate: `src/packages/db/drizzle/meta/*.json`

- [ ] **Step 1: Implement migration runner**

Update `src/packages/db/src/migrate.ts` to parse `DATABASE_URL`, connect with `pg`, run `drizzle-orm/node-postgres` migrations from `src/packages/db/drizzle`, and print a `MigrationStatus` JSON object.

- [ ] **Step 2: Generate initial migration**

Run: `pnpm db:generate`

Expected: drizzle-kit creates an initial SQL migration under `src/packages/db/drizzle`.

- [ ] **Step 3: Inspect generated SQL**

Verify the SQL includes `CREATE EXTENSION IF NOT EXISTS "vector";`, auth tables, tenant tables, knowledge/ingestion/RAG/audit/system tables, and `vector(1024)` for chunk embeddings.

- [ ] **Step 4: Run unit tests**

Run: `pnpm --filter @kb/db test`

Expected: PASS.

### Task 6: Local Migration Verification

**Files:**
- No source edits expected unless migration execution exposes a bug.

- [ ] **Step 1: Ensure PostgreSQL service is running**

Run: `docker compose up -d postgres`

Expected: PostgreSQL container starts and health check becomes healthy.

- [ ] **Step 2: Run migration**

Run: `pnpm db:migrate`

Expected: JSON output with `status: "ready"` and migration success message.

- [ ] **Step 3: Run package quality checks**

Run: `pnpm --filter @kb/db typecheck`

Expected: PASS.

Run: `pnpm --filter @kb/db lint`

Expected: PASS.

Run: `pnpm --filter @kb/db test`

Expected: PASS.

### Task 7: Final Verification

**Files:**
- Modify if needed: `.trellis/tasks/05-15-database-design/prd.md`

- [ ] **Step 1: Update task PRD acceptance criteria**

Mark completed acceptance criteria in `prd.md` if implementation and verification succeed.

- [ ] **Step 2: Run repository-level checks**

Run: `pnpm typecheck`

Expected: PASS.

Run: `pnpm lint`

Expected: PASS.

Run: `pnpm test`

Expected: PASS.

- [ ] **Step 3: Review git diff**

Run: `git diff --stat`

Expected: Changes are limited to the database task, package dependency metadata, migration files, and task documentation.

