import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";

import type { DatabaseConfig } from "./index";
import { schema } from "./schema";

export type ProjectDb = NodePgDatabase<typeof schema>;

export interface ProjectDbRuntime {
  db: ProjectDb;
  pool: pg.Pool;
}

export function createDbPool(config: DatabaseConfig): pg.Pool {
  return new pg.Pool({
    connectionString: config.databaseUrl,
    max: config.poolSize,
  });
}

export function createDrizzleDb(pool: pg.Pool): ProjectDb {
  return drizzle(pool, { schema });
}

export function createPostgresJsDatabase(config: DatabaseConfig): ProjectDbRuntime {
  const pool = createDbPool(config);

  return {
    db: createDrizzleDb(pool),
    pool,
  };
}
