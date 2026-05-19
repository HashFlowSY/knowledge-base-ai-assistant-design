import { describe, expect, it } from "vitest";

import { createDbPool, createDrizzleDb, createPostgresJsDatabase } from "./client";

describe("database client factory", () => {
  it("creates a pg pool from database config without connecting immediately", async () => {
    const pool = createDbPool({
      databaseUrl: "postgres://kb:kb@localhost:5432/kb",
      poolSize: 3,
    });

    expect(pool.options.max).toBe(3);

    await pool.end();
  });

  it("creates a drizzle database bound to the project schema", async () => {
    const pool = createDbPool({
      databaseUrl: "postgres://kb:kb@localhost:5432/kb",
      poolSize: 1,
    });
    const db = createDrizzleDb(pool);

    expect(db.query.authUsers).toBeDefined();
    expect(db.query.tenantMemberships).toBeDefined();

    await pool.end();
  });

  it("returns the database and pool together for runtime wiring", async () => {
    const runtime = createPostgresJsDatabase({
      databaseUrl: "postgres://kb:kb@localhost:5432/kb",
      poolSize: 2,
    });

    expect(runtime.db.query.authSessions).toBeDefined();
    expect(runtime.pool.options.max).toBe(2);

    await runtime.pool.end();
  });
});
