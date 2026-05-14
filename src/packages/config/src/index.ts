import { z } from "zod";

import { serviceNameSchema } from "@kb/shared";

const envSchema = z.object({
  SERVICE_NAME: serviceNameSchema.default("api"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  API_BASE_URL: z.string().url().default("http://localhost:4000"),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  MEILISEARCH_HOST: z.string().url(),
  MEILISEARCH_MASTER_KEY: z.string().min(1),
  S3_ENDPOINT: z.string().url(),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(16),
  APP_ENCRYPTION_KEY: z.string().min(32),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(50).default(2),
});

export type RuntimeConfig = z.infer<typeof envSchema>;

export function loadRuntimeConfig(env: NodeJS.ProcessEnv): RuntimeConfig {
  return envSchema.parse(env);
}

export function redactRuntimeConfig(config: RuntimeConfig): Omit<
  RuntimeConfig,
  | "DATABASE_URL"
  | "REDIS_URL"
  | "MEILISEARCH_MASTER_KEY"
  | "S3_ACCESS_KEY_ID"
  | "S3_SECRET_ACCESS_KEY"
  | "BETTER_AUTH_SECRET"
  | "APP_ENCRYPTION_KEY"
> & {
  secrets: "[REDACTED]";
} {
  const safeConfig = {
    SERVICE_NAME: config.SERVICE_NAME,
    NODE_ENV: config.NODE_ENV,
    LOG_LEVEL: config.LOG_LEVEL,
    APP_BASE_URL: config.APP_BASE_URL,
    API_BASE_URL: config.API_BASE_URL,
    MEILISEARCH_HOST: config.MEILISEARCH_HOST,
    S3_ENDPOINT: config.S3_ENDPOINT,
    S3_BUCKET: config.S3_BUCKET,
    WORKER_CONCURRENCY: config.WORKER_CONCURRENCY,
  };

  return {
    ...safeConfig,
    secrets: "[REDACTED]",
  };
}
