import { readdirSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  auditLogs,
  databaseConfigSchema,
  databaseMigrationConfigSchema,
  documentSources,
  documentSourceObjectCleanupStatusEnum,
  documentSourceScanStatusEnum,
  documentSourceUploadStatusEnum,
  ingestionJobStatusEnum,
  knowledgeBases,
  migrationStatusSchema,
  providerConfigs,
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
    expect(documentSources).toBe(schema.documentSources);
  });

  it("exports document upload state columns for source lifecycle tracking", () => {
    expect(documentSources.bucket).toBeDefined();
    expect(documentSources.uploadStatus).toBeDefined();
    expect(documentSources.scanStatus).toBeDefined();
    expect(documentSources.uploadedAt).toBeDefined();
    expect(documentSources.uploadErrorCode).toBeDefined();
    expect(documentSources.uploadErrorMessage).toBeDefined();
    expect(documentSources.objectCleanupStatus).toBeDefined();
    expect(documentSources.objectCleanupErrorCode).toBeDefined();
    expect(documentSources.objectCleanupErrorMessage).toBeDefined();
    expect(documentSources.objectCleanupClaimToken).toBeDefined();
    expect(documentSources.objectCleanupClaimedAt).toBeDefined();
  });

  it("exports upload, scan, cleanup, and pending-source job enums", () => {
    expect(documentSourceUploadStatusEnum.enumValues).toEqual([
      "pending_upload",
      "available",
      "upload_failed",
    ]);
    expect(documentSourceScanStatusEnum.enumValues).toEqual([
      "not_scanned",
      "pending",
      "clean",
      "infected",
      "scan_failed",
    ]);
    expect(documentSourceObjectCleanupStatusEnum.enumValues).toEqual([
      "not_required",
      "pending_cleanup",
      "cleanup_in_progress",
      "cleanup_succeeded",
      "cleanup_failed",
    ]);
    expect(ingestionJobStatusEnum.enumValues).toContain("pending_source");
  });

  it("uses the initial embedding vector dimension", () => {
    expect(vectorDimensions.chunkEmbedding).toBe(1024);
  });

  it("exports fixed provider config fields and tenant-kind uniqueness", () => {
    expect(providerConfigs.baseUrl).toBeDefined();
    expect(schema.providerConfigs).toBe(providerConfigs);
    const providerConfigMigration = readdirSync("drizzle")
      .filter((file) => file.startsWith("0005_") && file.endsWith(".sql"))
      .map((file) => readFileSync(`drizzle/${file}`, "utf8"))
      .join("\n");

    expect(providerConfigMigration).toContain("provider_configs_tenant_kind_idx");
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
