import path from "node:path";
import { fileURLToPath } from "node:url";

import { serve } from "@hono/node-server";
import { config as loadEnv } from "dotenv";

import { createDefaultApiApp } from "./app";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

loadEnv({ path: path.join(repoRoot, ".env") });

const port = Number.parseInt(process.env.PORT ?? "4000", 10);
const app = createDefaultApiApp(process.env);

serve({
  fetch: app.fetch,
  port,
});
