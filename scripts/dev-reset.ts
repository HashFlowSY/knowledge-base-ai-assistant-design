import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type EnvMap = Record<string, string | undefined>;

export interface DevResetConfig {
  projectEnv: Record<string, string>;
  s3Bucket: string;
}

export type ValidationResult =
  | {
      ok: true;
      config: DevResetConfig;
    }
  | {
      ok: false;
      errors: string[];
    };

export interface CommandSpec {
  label: string;
  command: string;
  args: string[];
}

const localHosts = new Set(["localhost", "127.0.0.1"]);
const composeContainers = [
  "kb-postgres",
  "kb-redis",
  "kb-meilisearch",
  "kb-minio",
];

export function parseDotEnv(content: string): Record<string, string> {
  const env: Record<string, string> = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const rawKey = line.slice(0, separatorIndex).trim();
    const key = rawKey.startsWith("export ") ? rawKey.slice(7).trim() : rawKey;
    const rawValue = line.slice(separatorIndex + 1).trim();

    env[key] = unquoteEnvValue(rawValue);
  }

  return env;
}

export function validateDevResetEnvironment(env: EnvMap): ValidationResult {
  const errors: string[] = [];
  const nodeEnv = getRequiredValue(env, "NODE_ENV");
  const s3Bucket = getRequiredValue(env, "S3_BUCKET");
  const s3AccessKeyId = getRequiredValue(env, "S3_ACCESS_KEY_ID");
  const s3SecretAccessKey = getRequiredValue(env, "S3_SECRET_ACCESS_KEY");

  if (nodeEnv !== "development") {
    errors.push('NODE_ENV must be "development" in the project root .env.');
  }

  validateLocalUrl(errors, env, {
    key: "DATABASE_URL",
    expectedPort: "5432",
    allowedProtocols: new Set(["postgres:", "postgresql:"]),
  });
  validateLocalUrl(errors, env, {
    key: "REDIS_URL",
    expectedPort: "6379",
    allowedProtocols: new Set(["redis:", "rediss:"]),
  });
  validateLocalUrl(errors, env, {
    key: "MEILISEARCH_HOST",
    expectedPort: "7700",
    allowedProtocols: new Set(["http:", "https:"]),
  });
  validateLocalUrl(errors, env, {
    key: "S3_ENDPOINT",
    expectedPort: "9000",
    allowedProtocols: new Set(["http:", "https:"]),
  });

  if (s3Bucket === undefined) {
    errors.push("S3_BUCKET must be set in the project root .env.");
  }

  if (s3AccessKeyId !== "minioadmin") {
    errors.push("S3_ACCESS_KEY_ID must match the local MinIO compose user.");
  }

  if (s3SecretAccessKey !== "minioadmin") {
    errors.push(
      "S3_SECRET_ACCESS_KEY must match the local MinIO compose password.",
    );
  }

  if (errors.length > 0 || s3Bucket === undefined) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    config: {
      projectEnv: normalizeEnv(env),
      s3Bucket,
    },
  };
}

export function createDevResetCommandPlan(input: {
  config: DevResetConfig;
  composeFilePath: string;
}): CommandSpec[] {
  return [
    {
      label: "Stop and remove local middleware volumes",
      command: "docker",
      args: [
        "compose",
        "-f",
        input.composeFilePath,
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
        input.composeFilePath,
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
        `local/${input.config.s3Bucket}`,
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
  ];
}

async function runDevReset(): Promise<void> {
  const repoRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  const envPath = path.join(repoRoot, ".env");

  if (!existsSync(envPath)) {
    throw new Error(
      'Refusing to reset local middleware: project root ".env" does not exist.',
    );
  }

  const projectEnv = parseDotEnv(readFileSync(envPath, "utf8"));
  const validation = validateDevResetEnvironment(projectEnv);

  if (!validation.ok) {
    throw new Error(
      [
        "Refusing to reset local middleware because dev safety checks failed:",
        ...validation.errors.map((error) => `- ${error}`),
      ].join("\n"),
    );
  }

  process.stdout.write(
    [
      "Resetting local development middleware.",
      "This removes only this repository's Docker Compose containers and volumes.",
      "Docker images are preserved.",
      "",
    ].join("\n"),
  );

  const plan = createDevResetCommandPlan({
    config: validation.config,
    composeFilePath: path.join(repoRoot, "compose.yaml"),
  });

  for (const step of plan) {
    await runCommand({
      cwd: repoRoot,
      env: validation.config.projectEnv,
      step,
    });

    if (step.label === "Start local middleware services") {
      await waitForHealthyContainers({
        cwd: repoRoot,
        env: validation.config.projectEnv,
      });
    }
  }

  process.stdout.write(
    "\nLocal middleware reset complete. Run `pnpm dev` to start the app.\n",
  );
}

function unquoteEnvValue(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function getRequiredValue(env: EnvMap, key: string): string | undefined {
  const value = env[key];
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeEnv(env: EnvMap): Record<string, string> {
  const normalized: Record<string, string> = {};

  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) {
      normalized[key] = value;
    }
  }

  return normalized;
}

function validateLocalUrl(
  errors: string[],
  env: EnvMap,
  input: {
    key: string;
    expectedPort: string;
    allowedProtocols: Set<string>;
  },
): void {
  const value = getRequiredValue(env, input.key);
  if (value === undefined) {
    errors.push(
      `${input.key} must target localhost or 127.0.0.1 on port ${input.expectedPort}.`,
    );
    return;
  }

  try {
    const url = new URL(value);
    if (
      !input.allowedProtocols.has(url.protocol) ||
      !localHosts.has(url.hostname) ||
      url.port !== input.expectedPort
    ) {
      errors.push(
        `${input.key} must target localhost or 127.0.0.1 on port ${input.expectedPort}.`,
      );
    }
  } catch {
    errors.push(
      `${input.key} must target localhost or 127.0.0.1 on port ${input.expectedPort}.`,
    );
  }
}

async function runCommand(input: {
  cwd: string;
  env: Record<string, string>;
  step: CommandSpec;
}): Promise<void> {
  process.stdout.write(`\n> ${input.step.label}\n`);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(input.step.command, input.step.args, {
      cwd: input.cwd,
      env: {
        ...process.env,
        ...input.env,
      },
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `${input.step.label} failed with exit code ${code ?? "unknown"}.`,
        ),
      );
    });
  });
}

async function waitForHealthyContainers(input: {
  cwd: string;
  env: Record<string, string>;
}): Promise<void> {
  const deadline = Date.now() + 90_000;

  process.stdout.write("\n> Wait for middleware health checks\n");

  while (Date.now() < deadline) {
    const result = await captureCommand({
      cwd: input.cwd,
      env: input.env,
      command: "docker",
      args: [
        "inspect",
        "--format",
        "{{.State.Health.Status}}",
        ...composeContainers,
      ],
    });

    const statuses = result.stdout
      .split(/\r?\n/)
      .map((status) => status.trim())
      .filter((status) => status.length > 0);

    if (
      result.exitCode === 0 &&
      statuses.length === composeContainers.length &&
      statuses.every((status) => status === "healthy")
    ) {
      process.stdout.write("All local middleware services are healthy.\n");
      return;
    }

    await sleep(1_000);
  }

  throw new Error("Timed out waiting for local middleware health checks.");
}

async function captureCommand(input: {
  cwd: string;
  env: Record<string, string>;
  command: string;
  args: string[];
}): Promise<{
  exitCode: number | null;
  stdout: string;
}> {
  return await new Promise((resolve, reject) => {
    const child = spawn(input.command, input.args, {
      cwd: input.cwd,
      env: {
        ...process.env,
        ...input.env,
      },
      stdio: ["ignore", "pipe", "ignore"],
    });
    const stdoutChunks: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutChunks.push(chunk);
    });
    child.on("error", reject);
    child.on("close", (exitCode) => {
      resolve({
        exitCode,
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
      });
    });
  });
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isMainModule(): boolean {
  const entrypoint = process.argv[1];
  return (
    entrypoint !== undefined &&
    path.resolve(entrypoint) === fileURLToPath(import.meta.url)
  );
}

if (isMainModule()) {
  runDevReset().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
