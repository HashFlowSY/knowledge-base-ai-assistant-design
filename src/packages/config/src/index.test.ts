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
    expect(config.WORKER_CONCURRENCY).toBe(2);
    expect(config.UPLOAD_MAX_FILE_BYTES).toBe(8 * 1024 * 1024);
    expect(config.UPLOAD_RATE_LIMIT_PER_MINUTE).toBe(20);
    expect(config.UPLOAD_CONCURRENCY_PER_ACTOR).toBe(2);
    expect(config.UPLOAD_CONCURRENCY_PER_TENANT).toBe(10);
  });

  it("redacts secrets from config dumps", () => {
    const redacted = redactRuntimeConfig(loadRuntimeConfig(validEnv));

    expect(redacted).toMatchObject({ secrets: "[REDACTED]" });
    expect("DATABASE_URL" in redacted).toBe(false);
    expect(redacted.UPLOAD_MAX_FILE_BYTES).toBe(8 * 1024 * 1024);
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
});
