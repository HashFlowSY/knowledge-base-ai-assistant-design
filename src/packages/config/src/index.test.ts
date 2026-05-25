import { describe, expect, it } from "vitest";

import { loadRuntimeConfig, redactRuntimeConfig } from "./index";

const validEnv = {
  DATABASE_URL: "postgres://kb:kb@localhost:5432/kb",
  REDIS_URL: "redis://localhost:6379",
  MEILISEARCH_HOST: "http://localhost:7700",
  MEILISEARCH_MASTER_KEY: "local-meili-master-key",
  S3_ENDPOINT: "http://localhost:9000",
  S3_BUCKET: "knowledge-base",
  S3_ACCESS_KEY_ID: "minioadmin",
  S3_SECRET_ACCESS_KEY: "minioadmin",
  BETTER_AUTH_SECRET: "local-better-auth-secret",
  APP_ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef",
};

describe("@kb/config", () => {
  it("loads required local runtime configuration", () => {
    const config = loadRuntimeConfig(validEnv);

    expect(config.SERVICE_NAME).toBe("api");
    expect(config.PORT).toBe(4000);
    expect(config.WORKER_CONCURRENCY).toBe(2);
    expect(config.UPLOAD_MAX_FILE_BYTES).toBe(8 * 1024 * 1024);
    expect(config.UPLOAD_RATE_LIMIT_PER_MINUTE).toBe(20);
    expect(config.UPLOAD_CONCURRENCY_PER_ACTOR).toBe(2);
    expect(config.UPLOAD_CONCURRENCY_PER_TENANT).toBe(10);
    expect(config.INGESTION_QUEUE_ATTEMPTS).toBe(3);
    expect(config.INGESTION_QUEUE_BACKOFF_MS).toBe(5_000);
    expect(config.INGESTION_REQUEUE_STALE_AFTER_MS).toBe(300_000);
    expect(config.INGESTION_REQUEUE_BATCH_SIZE).toBe(100);
    expect(config.INGESTION_PARSER_CONCURRENCY).toBe(2);
    expect(config.INGESTION_EMBEDDING_CONCURRENCY).toBe(1);
    expect(config.INGESTION_INDEX_CONCURRENCY).toBe(1);
    expect(config.INGESTION_CHUNK_SIZE).toBe(1_000);
    expect(config.INGESTION_CHUNK_OVERLAP).toBe(150);
  });

  it("redacts secrets from config dumps", () => {
    const redacted = redactRuntimeConfig(loadRuntimeConfig(validEnv));

    expect(redacted).toMatchObject({ secrets: "[REDACTED]" });
    expect("DATABASE_URL" in redacted).toBe(false);
    expect(redacted.PORT).toBe(4000);
    expect(redacted.UPLOAD_MAX_FILE_BYTES).toBe(8 * 1024 * 1024);
    expect(redacted.INGESTION_QUEUE_ATTEMPTS).toBe(3);
  });

  it("allows the API server port to be configured from environment", () => {
    const config = loadRuntimeConfig({
      ...validEnv,
      PORT: "4101",
    });

    expect(config.PORT).toBe(4101);
  });

  it("allows upload limits to be configured from environment", () => {
    const config = loadRuntimeConfig({
      ...validEnv,
      UPLOAD_CONCURRENCY_PER_ACTOR: "3",
      UPLOAD_CONCURRENCY_PER_TENANT: "12",
      UPLOAD_MAX_FILE_BYTES: "1048576",
      UPLOAD_RATE_LIMIT_PER_MINUTE: "25",
      UPLOAD_REQUEST_OVERHEAD_BYTES: "32768",
    });

    expect(config).toMatchObject({
      UPLOAD_CONCURRENCY_PER_ACTOR: 3,
      UPLOAD_CONCURRENCY_PER_TENANT: 12,
      UPLOAD_MAX_FILE_BYTES: 1_048_576,
      UPLOAD_RATE_LIMIT_PER_MINUTE: 25,
      UPLOAD_REQUEST_OVERHEAD_BYTES: 32_768,
    });
  });

  it("allows ingestion worker settings to be configured from environment", () => {
    const config = loadRuntimeConfig({
      ...validEnv,
      INGESTION_CHUNK_OVERLAP: "200",
      INGESTION_CHUNK_SIZE: "1200",
      INGESTION_EMBEDDING_CONCURRENCY: "2",
      INGESTION_INDEX_CONCURRENCY: "2",
      INGESTION_PARSER_CONCURRENCY: "4",
      INGESTION_QUEUE_ATTEMPTS: "5",
      INGESTION_QUEUE_BACKOFF_MS: "7500",
      INGESTION_REQUEUE_BATCH_SIZE: "25",
      INGESTION_REQUEUE_STALE_AFTER_MS: "600000",
    });

    expect(config).toMatchObject({
      INGESTION_CHUNK_OVERLAP: 200,
      INGESTION_CHUNK_SIZE: 1_200,
      INGESTION_EMBEDDING_CONCURRENCY: 2,
      INGESTION_INDEX_CONCURRENCY: 2,
      INGESTION_PARSER_CONCURRENCY: 4,
      INGESTION_QUEUE_ATTEMPTS: 5,
      INGESTION_QUEUE_BACKOFF_MS: 7_500,
      INGESTION_REQUEUE_BATCH_SIZE: 25,
      INGESTION_REQUEUE_STALE_AFTER_MS: 600_000,
    });
  });
});
