import { Hono } from "hono";
import { z } from "zod";

import { createLogger } from "@kb/observability";
import { createUtcTimestamp } from "@kb/shared";

export interface ApiContextVariables {
  requestId: string;
}

export interface ApiEnv {
  Variables: ApiContextVariables;
}

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("api"),
  timestamp: z.string().datetime(),
  requestId: z.string().min(1),
  dependencies: z.object({
    config: z.literal("not_checked"),
    database: z.literal("not_checked"),
    redis: z.literal("not_checked"),
    meilisearch: z.literal("not_checked"),
    objectStorage: z.literal("not_checked"),
  }),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export function createApiApp(): Hono<ApiEnv> {
  const app = new Hono<ApiEnv>();
  const logger = createLogger({ service: "api" });

  app.use("*", async (context, next) => {
    const existingRequestId = context.req.header("x-request-id");
    const requestId =
      existingRequestId && existingRequestId.length > 0
        ? existingRequestId
        : crypto.randomUUID();

    context.set("requestId", requestId);
    context.header("X-Request-Id", requestId);

    await next();

    logger.info("api_request_finished", {
      requestId,
      method: context.req.method,
      path: context.req.path,
      status: context.res.status,
    });
  });

  app.get("/health", (context) => {
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

  return app;
}

export const app = createApiApp();
export type ApiApp = typeof app;
