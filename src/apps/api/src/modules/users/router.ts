import { Hono } from "hono";

import type { ApiEnv } from "../../contracts";
import { createUserProcedure } from "./procedures/create-user";
import { getUserProcedure } from "./procedures/get-user";
import { listUsersProcedure } from "./procedures/list-users";
import { removeUserAccessProcedure } from "./procedures/remove-user-access";
import { updateUserProcedure } from "./procedures/update-user";
import type { UserRouteDependencies } from "./dependencies";

export function createUsersRouter(
  dependencies: UserRouteDependencies,
): Hono<ApiEnv> {
  const router = new Hono<ApiEnv>();

  router.get("/api/users", (context) =>
    listUsersProcedure(context, dependencies),
  );
  router.post("/api/users", (context) =>
    createUserProcedure(context, dependencies),
  );
  router.get("/api/users/:userId", (context) =>
    getUserProcedure(context, dependencies),
  );
  router.patch("/api/users/:userId", (context) =>
    updateUserProcedure(context, dependencies),
  );
  router.delete("/api/users/:userId/access", (context) =>
    removeUserAccessProcedure(context, dependencies),
  );

  return router;
}
