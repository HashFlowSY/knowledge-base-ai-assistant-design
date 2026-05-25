import { z } from "zod";

import { serviceNameSchema } from "@kb/shared";

export const defaultApiPort = 4000;
export const defaultUploadMaxFileBytes = 8 * 1024 * 1024;
export const defaultUploadRequestOverheadBytes = 64 * 1024;
export const defaultUploadRateLimitPerMinute = 20;
export const defaultUploadConcurrencyPerActor = 2;
export const defaultUploadConcurrencyPerTenant = 10;
export const defaultIngestionQueueAttempts = 3;
export const defaultIngestionQueueBackoffMs = 5_000;
export const defaultIngestionRequeueStaleAfterMs = 300_000;
export const defaultIngestionRequeueBatchSize = 100;
export const defaultIngestionParserConcurrency = 2;
export const defaultIngestionEmbeddingConcurrency = 1;
export const defaultIngestionIndexConcurrency = 1;
export const defaultIngestionChunkSize = 1_000;
export const defaultIngestionChunkOverlap = 150;

const envSchema = z.object({
  SERVICE_NAME: serviceNameSchema.default("api"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(defaultApiPort),
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
  UPLOAD_MAX_FILE_BYTES: z.coerce
    .number()
    .int()
    .min(1)
    .max(100 * 1024 * 1024)
    .default(defaultUploadMaxFileBytes),
  UPLOAD_REQUEST_OVERHEAD_BYTES: z.coerce
    .number()
    .int()
    .min(0)
    .max(1024 * 1024)
    .default(defaultUploadRequestOverheadBytes),
  UPLOAD_RATE_LIMIT_PER_MINUTE: z.coerce
    .number()
    .int()
    .min(1)
    .max(1_000)
    .default(defaultUploadRateLimitPerMinute),
  UPLOAD_CONCURRENCY_PER_ACTOR: z.coerce
    .number()
    .int()
    .min(1)
    .max(50)
    .default(defaultUploadConcurrencyPerActor),
  UPLOAD_CONCURRENCY_PER_TENANT: z.coerce
    .number()
    .int()
    .min(1)
    .max(500)
    .default(defaultUploadConcurrencyPerTenant),
  INGESTION_QUEUE_ATTEMPTS: z.coerce
    .number()
    .int()
    .min(1)
    .max(10)
    .default(defaultIngestionQueueAttempts),
  INGESTION_QUEUE_BACKOFF_MS: z.coerce
    .number()
    .int()
    .min(100)
    .max(60_000)
    .default(defaultIngestionQueueBackoffMs),
  INGESTION_REQUEUE_STALE_AFTER_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(24 * 60 * 60 * 1_000)
    .default(defaultIngestionRequeueStaleAfterMs),
  INGESTION_REQUEUE_BATCH_SIZE: z.coerce
    .number()
    .int()
    .min(1)
    .max(1_000)
    .default(defaultIngestionRequeueBatchSize),
  INGESTION_PARSER_CONCURRENCY: z.coerce
    .number()
    .int()
    .min(1)
    .max(20)
    .default(defaultIngestionParserConcurrency),
  INGESTION_EMBEDDING_CONCURRENCY: z.coerce
    .number()
    .int()
    .min(1)
    .max(20)
    .default(defaultIngestionEmbeddingConcurrency),
  INGESTION_INDEX_CONCURRENCY: z.coerce
    .number()
    .int()
    .min(1)
    .max(20)
    .default(defaultIngestionIndexConcurrency),
  INGESTION_CHUNK_SIZE: z.coerce
    .number()
    .int()
    .min(100)
    .max(20_000)
    .default(defaultIngestionChunkSize),
  INGESTION_CHUNK_OVERLAP: z.coerce
    .number()
    .int()
    .min(0)
    .max(5_000)
    .default(defaultIngestionChunkOverlap),
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
    PORT: config.PORT,
    NODE_ENV: config.NODE_ENV,
    LOG_LEVEL: config.LOG_LEVEL,
    APP_BASE_URL: config.APP_BASE_URL,
    API_BASE_URL: config.API_BASE_URL,
    MEILISEARCH_HOST: config.MEILISEARCH_HOST,
    S3_ENDPOINT: config.S3_ENDPOINT,
    S3_BUCKET: config.S3_BUCKET,
    WORKER_CONCURRENCY: config.WORKER_CONCURRENCY,
    UPLOAD_MAX_FILE_BYTES: config.UPLOAD_MAX_FILE_BYTES,
    UPLOAD_REQUEST_OVERHEAD_BYTES: config.UPLOAD_REQUEST_OVERHEAD_BYTES,
    UPLOAD_RATE_LIMIT_PER_MINUTE: config.UPLOAD_RATE_LIMIT_PER_MINUTE,
    UPLOAD_CONCURRENCY_PER_ACTOR: config.UPLOAD_CONCURRENCY_PER_ACTOR,
    UPLOAD_CONCURRENCY_PER_TENANT: config.UPLOAD_CONCURRENCY_PER_TENANT,
    INGESTION_QUEUE_ATTEMPTS: config.INGESTION_QUEUE_ATTEMPTS,
    INGESTION_QUEUE_BACKOFF_MS: config.INGESTION_QUEUE_BACKOFF_MS,
    INGESTION_REQUEUE_STALE_AFTER_MS:
      config.INGESTION_REQUEUE_STALE_AFTER_MS,
    INGESTION_REQUEUE_BATCH_SIZE: config.INGESTION_REQUEUE_BATCH_SIZE,
    INGESTION_PARSER_CONCURRENCY: config.INGESTION_PARSER_CONCURRENCY,
    INGESTION_EMBEDDING_CONCURRENCY: config.INGESTION_EMBEDDING_CONCURRENCY,
    INGESTION_INDEX_CONCURRENCY: config.INGESTION_INDEX_CONCURRENCY,
    INGESTION_CHUNK_SIZE: config.INGESTION_CHUNK_SIZE,
    INGESTION_CHUNK_OVERLAP: config.INGESTION_CHUNK_OVERLAP,
  };

  return {
    ...safeConfig,
    secrets: "[REDACTED]",
  };
}
