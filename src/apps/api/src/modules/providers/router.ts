import { Hono } from "hono";

import type { ApiEnv } from "../../contracts";
import { listProvidersProcedure } from "./procedures/list-providers";
import { providerPublicKeyProcedure } from "./procedures/provider-public-key";
import { saveProviderProcedure } from "./procedures/save-provider";
import type { ProviderRouteDependencies } from "./dependencies";

export function createProvidersRouter(
  dependencies: ProviderRouteDependencies,
): Hono<ApiEnv> {
  const router = new Hono<ApiEnv>();

  router.get("/api/providers", (context) =>
    listProvidersProcedure(context, dependencies),
  );
  router.get("/api/providers/public-key", (context) =>
    providerPublicKeyProcedure(context, dependencies),
  );
  router.put("/api/providers/:kind", (context) =>
    saveProviderProcedure(context, dependencies),
  );

  return router;
}
