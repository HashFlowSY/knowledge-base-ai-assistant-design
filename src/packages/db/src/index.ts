import { z } from "zod";

export * from "./schema";

export const databaseConfigSchema = z.object({
  databaseUrl: z.string().url(),
  poolSize: z.number().int().min(1).max(50).default(10),
});

export type DatabaseConfig = z.infer<typeof databaseConfigSchema>;

export const databaseMigrationConfigSchema = z.object({
  databaseUrl: z.string().url(),
  migrationsFolder: z.string().min(1).default("src/packages/db/drizzle"),
});

export type DatabaseMigrationConfig = z.infer<
  typeof databaseMigrationConfigSchema
>;

export const migrationStatusSchema = z.object({
  status: z.enum(["not_configured", "ready"]),
  message: z.string().min(1),
});

export type MigrationStatus = z.infer<typeof migrationStatusSchema>;

export function shouldLoadExampleEnv(nodeEnv: string | undefined): boolean {
  return nodeEnv !== "production";
}
