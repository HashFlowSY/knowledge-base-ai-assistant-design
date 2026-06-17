import type { Context } from "hono";

import type { ApiEnv } from "../../../contracts";
import { createSuccessResponse } from "../../../http";
import { getRequiredActor } from "../../../middleware";
import type { ProviderRouteDependencies } from "../dependencies";

export async function listProvidersProcedure(
  context: Context<ApiEnv>,
  dependencies: ProviderRouteDependencies,
): Promise<Response> {
  const result = await dependencies.providerConfigService.listProviderConfigs({
    actor: getRequiredActor(context),
  });

  return context.json(
    createSuccessResponse({
      data: {
        providers: result.providers,
      },
      httpStatus: 200,
      requestId: context.get("requestId"),
    }),
    200,
  );
}
