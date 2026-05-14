import { serve } from "@hono/node-server";

import { app } from "./app";

const port = Number.parseInt(process.env.PORT ?? "4000", 10);

serve({
  fetch: app.fetch,
  port,
});
