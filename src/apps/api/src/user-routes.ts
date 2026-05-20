import type { Hono } from "hono";

import type { ApiEnv } from "./contracts";
import { createUsersRouter } from "./modules/users/router";
import type { UserRouteDependencies } from "./modules/users/types";

export function registerUserRoutes(
  app: Hono<ApiEnv>,
  input: UserRouteDependencies,
): void {
  app.route("/", createUsersRouter(input));
}
