import { Hono } from "hono";

import type { ApiEnv } from "../../contracts";
import { loginProcedure } from "./procedures/login";
import { logoutProcedure } from "./procedures/logout";
import { sessionProcedure } from "./procedures/session";
import type { AuthRouteDependencies } from "./dependencies";

export function createAuthRouter(
  dependencies: AuthRouteDependencies,
): Hono<ApiEnv> {
  const router = new Hono<ApiEnv>();

  router.post("/api/auth/login", (context) =>
    loginProcedure(context, dependencies),
  );
  router.post("/api/auth/logout", (context) =>
    logoutProcedure(context, dependencies),
  );
  router.get("/api/auth/session", (context) =>
    sessionProcedure(context, dependencies),
  );

  return router;
}
