import { describe, expect, it } from "vitest";

import {
  auditLogs,
  databaseConfigSchema,
  databaseMigrationConfigSchema,
  knowledgeBases,
  migrationStatusSchema,
  shouldLoadExampleEnv,
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

  it("uses example env files only outside production", () => {
    expect(shouldLoadExampleEnv(undefined)).toBe(true);
    expect(shouldLoadExampleEnv("development")).toBe(true);
    expect(shouldLoadExampleEnv("test")).toBe(true);
    expect(shouldLoadExampleEnv("production")).toBe(false);
  });
});
