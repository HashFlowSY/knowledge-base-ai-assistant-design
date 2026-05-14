import { z } from "zod";

export const databaseConfigSchema = z.object({
  databaseUrl: z.string().url(),
  poolSize: z.number().int().min(1).max(50).default(10),
});

export type DatabaseConfig = z.infer<typeof databaseConfigSchema>;

export const migrationStatusSchema = z.object({
  status: z.enum(["not_configured", "ready"]),
  message: z.string().min(1),
});

export type MigrationStatus = z.infer<typeof migrationStatusSchema>;
