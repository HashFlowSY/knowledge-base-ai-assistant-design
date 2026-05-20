import { Hono } from "hono";

import { createUtcTimestamp } from "@kb/shared";

import type { ApiEnv } from "../../contracts";
import { healthResponseSchema } from "./types";

export function createHealthRouter(): Hono<ApiEnv> {
  const router = new Hono<ApiEnv>();

  router.get("/health", (context) => {
    const response = healthResponseSchema.parse({
      status: "ok",
      service: "api",
      timestamp: createUtcTimestamp(),
      requestId: context.get("requestId"),
      dependencies: {
        config: "not_checked",
        database: "not_checked",
        redis: "not_checked",
        meilisearch: "not_checked",
        objectStorage: "not_checked",
      },
    });

    return context.json(response);
  });

  return router;
}
