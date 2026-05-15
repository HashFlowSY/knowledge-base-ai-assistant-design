import path from "node:path";
import { fileURLToPath } from "node:url";

import { config as loadEnv } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

import {
  databaseMigrationConfigSchema,
  migrationStatusSchema,
  shouldLoadExampleEnv,
} from "./index";

const migrationsFolder = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../drizzle",
);
const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

loadEnv({ path: path.join(repoRoot, ".env") });

if (shouldLoadExampleEnv(process.env.NODE_ENV)) {
  loadEnv({ path: path.join(repoRoot, ".env.example") });
}

const config = databaseMigrationConfigSchema.parse({
  databaseUrl: process.env.DATABASE_URL,
  migrationsFolder,
});

const client = new pg.Client({
  connectionString: config.databaseUrl,
});

try {
  await client.connect();

  await client.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto";');
  await client.query('CREATE EXTENSION IF NOT EXISTS "vector";');

  const db = drizzle(client);
  await migrate(db, {
    migrationsFolder: config.migrationsFolder,
  });

  const status = migrationStatusSchema.parse({
    status: "ready",
    message: `Migrations applied from ${config.migrationsFolder}.`,
  });

  process.stdout.write(`${JSON.stringify(status)}\n`);
} finally {
  await client.end();
}
