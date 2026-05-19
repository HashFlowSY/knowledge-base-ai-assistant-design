import { serve } from "@hono/node-server";

import { createDefaultApiApp } from "./app";

const port = Number.parseInt(process.env.PORT ?? "4000", 10);
const app = createDefaultApiApp(process.env);

serve({
  fetch: app.fetch,
  port,
});
