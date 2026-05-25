import path from "node:path";
import { fileURLToPath } from "node:url";

import { config as loadEnv } from "dotenv";

export {
  defaultDevAuthUsers,
  type DevAuthSeedRepository,
} from "./seed-dev-auth-contracts";
export {
  seedDevAuth,
  shouldRunDevAuthSeed,
} from "./seed-dev-auth-core";
export { createPgDevAuthSeedRepository } from "./seed-dev-auth-repository";
export { seedDevAuthFromEnvironment } from "./seed-dev-auth-runtime";
import {
  getDevAuthSeedEnvFiles,
  seedDevAuthFromEnvironment,
} from "./seed-dev-auth-runtime";

if (import.meta.url === `file://${process.argv[1]}`) {
  const repoRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../..",
  );

  for (const envFile of getDevAuthSeedEnvFiles({
    nodeEnv: process.env.NODE_ENV,
    repoRoot,
  })) {
    loadEnv({ path: envFile });
  }

  const result = await seedDevAuthFromEnvironment(process.env);
  if (!result.seeded) {
    throw new Error(result.message);
  }

  process.stdout.write(`${result.message}\n`);
}
