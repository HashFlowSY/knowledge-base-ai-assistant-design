import path from "node:path";
import { fileURLToPath } from "node:url";

import { serve } from "@hono/node-server";
import { loadRuntimeConfig } from "@kb/config";
import { config as loadEnv } from "dotenv";

import { createDefaultApiApp } from "./app";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

loadEnv({ path: path.join(repoRoot, ".env") });

const config = loadRuntimeConfig(process.env);
const app = createDefaultApiApp(process.env);

serve({
  fetch: app.fetch,
  port: config.PORT,
});
