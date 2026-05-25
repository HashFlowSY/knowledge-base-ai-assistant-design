import {
  createPostgresJsDatabase,
  databaseConfigSchema,
  shouldLoadExampleEnv,
} from "@kb/db";
import { createPgDevAuthSeedRepository } from "./seed-dev-auth-repository";
import { seedDevAuth, shouldRunDevAuthSeed } from "./seed-dev-auth-core";

export async function seedDevAuthFromEnvironment(
  env: NodeJS.ProcessEnv,
): Promise<{
  seeded: boolean;
  message: string;
}> {
  if (!shouldRunDevAuthSeed(env.NODE_ENV)) {
    return seedDevAuth({ nodeEnv: env.NODE_ENV });
  }

  const config = databaseConfigSchema.parse({
    databaseUrl: env.DATABASE_URL,
  });
  const runtime = createPostgresJsDatabase(config);

  try {
    return await seedDevAuth({
      nodeEnv: env.NODE_ENV,
      repository: createPgDevAuthSeedRepository(runtime.db),
    });
  } finally {
    await runtime.pool.end();
  }
}

export function getDevAuthSeedEnvFiles(input: {
  nodeEnv: string | undefined;
  repoRoot: string;
}): string[] {
  return shouldLoadExampleEnv(input.nodeEnv)
    ? [`${input.repoRoot}/.env`, `${input.repoRoot}/.env.example`]
    : [`${input.repoRoot}/.env`];
}
