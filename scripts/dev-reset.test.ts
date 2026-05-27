import { describe, expect, it } from "vitest";

import {
  createDevResetCommandPlan,
  parseDotEnv,
  validateDevResetEnvironment,
} from "./dev-reset";

const validEnv = {
  NODE_ENV: "development",
  DATABASE_URL: "postgres://kb:kb_local_password@localhost:5432/kb",
  REDIS_URL: "redis://127.0.0.1:6379",
  MEILISEARCH_HOST: "http://localhost:7700",
  S3_ENDPOINT: "http://127.0.0.1:9000",
  S3_BUCKET: "kb-source",
  S3_ACCESS_KEY_ID: "minioadmin",
  S3_SECRET_ACCESS_KEY: "minioadmin",
};

describe("dev reset environment validation", () => {
  it("accepts the local development compose environment", () => {
    const result = validateDevResetEnvironment(validEnv);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.s3Bucket).toBe("kb-source");
    }
  });

  it("rejects a non-development environment before destructive work", () => {
    const result = validateDevResetEnvironment({
      ...validEnv,
      NODE_ENV: "production",
    });

    expect(result).toEqual({
      ok: false,
      errors: ['NODE_ENV must be "development" in the project root .env.'],
    });
  });

  it("rejects dependency URLs that do not target local compose services", () => {
    const result = validateDevResetEnvironment({
      ...validEnv,
      DATABASE_URL: "postgres://kb:secret@db.internal:5432/kb",
      REDIS_URL: "redis://localhost:6380",
      MEILISEARCH_HOST: "https://search.example.com:7700",
      S3_ENDPOINT: "http://192.168.1.10:9000",
    });

    expect(result).toEqual({
      ok: false,
      errors: [
        "DATABASE_URL must target localhost or 127.0.0.1 on port 5432.",
        "REDIS_URL must target localhost or 127.0.0.1 on port 6379.",
        "MEILISEARCH_HOST must target localhost or 127.0.0.1 on port 7700.",
        "S3_ENDPOINT must target localhost or 127.0.0.1 on port 9000.",
      ],
    });
  });

  it("rejects missing bucket and non-local MinIO credentials", () => {
    const result = validateDevResetEnvironment({
      ...validEnv,
      S3_BUCKET: "",
      S3_ACCESS_KEY_ID: "remote-access-key",
      S3_SECRET_ACCESS_KEY: "remote-secret-key",
    });

    expect(result).toEqual({
      ok: false,
      errors: [
        "S3_BUCKET must be set in the project root .env.",
        "S3_ACCESS_KEY_ID must match the local MinIO compose user.",
        "S3_SECRET_ACCESS_KEY must match the local MinIO compose password.",
      ],
    });
  });
});

describe("dev reset command planning", () => {
  it("plans a destructive local compose volume reset without image deletion or app startup", () => {
    const validation = validateDevResetEnvironment(validEnv);

    expect(validation.ok).toBe(true);
    if (!validation.ok) {
      throw new Error(validation.errors.join("\n"));
    }

    const plan = createDevResetCommandPlan({
      config: validation.config,
      composeFilePath: "/repo/compose.yaml",
    });

    expect(plan.map((step) => step.command)).not.toContain("pnpm dev");
    expect(plan.flatMap((step) => step.args)).not.toContain("rmi");
    expect(plan).toEqual([
      {
        label: "Stop and remove local middleware volumes",
        command: "docker",
        args: [
          "compose",
          "-f",
          "/repo/compose.yaml",
          "down",
          "--volumes",
          "--remove-orphans",
        ],
      },
      {
        label: "Start local middleware services",
        command: "docker",
        args: [
          "compose",
          "-f",
          "/repo/compose.yaml",
          "up",
          "-d",
          "postgres",
          "redis",
          "meilisearch",
          "minio",
        ],
      },
      {
        label: "Configure local MinIO alias",
        command: "docker",
        args: [
          "exec",
          "kb-minio",
          "mc",
          "alias",
          "set",
          "local",
          "http://127.0.0.1:9000",
          "minioadmin",
          "minioadmin",
        ],
      },
      {
        label: "Create local MinIO bucket",
        command: "docker",
        args: [
          "exec",
          "kb-minio",
          "mc",
          "mb",
          "--ignore-existing",
          "local/kb-source",
        ],
      },
      {
        label: "Apply database migrations",
        command: "pnpm",
        args: ["db:migrate"],
      },
      {
        label: "Seed development auth data",
        command: "pnpm",
        args: ["--filter", "@kb/auth", "seed:dev-auth"],
      },
    ]);
  });
});

describe("dotenv parsing", () => {
  it("parses unquoted and quoted project env values", () => {
    expect(
      parseDotEnv(`
NODE_ENV=development
S3_BUCKET="kb-source"
S3_ACCESS_KEY_ID='minioadmin'
# ignored
S3_SECRET_ACCESS_KEY=minioadmin
`),
    ).toEqual({
      NODE_ENV: "development",
      S3_BUCKET: "kb-source",
      S3_ACCESS_KEY_ID: "minioadmin",
      S3_SECRET_ACCESS_KEY: "minioadmin",
    });
  });
});
