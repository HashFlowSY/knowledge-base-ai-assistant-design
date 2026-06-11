import type { Context } from "hono";

import type { ApiEnv } from "../../../contracts";
import { createSuccessResponse } from "../../../http";
import type { ProviderRouteDependencies } from "../dependencies";

export async function providerPublicKeyProcedure(
  context: Context<ApiEnv>,
  dependencies: ProviderRouteDependencies,
): Promise<Response> {
  const publicKey = await dependencies.providerTransportKeyService.createPublicKey();

  return context.json(
    createSuccessResponse({
      data: publicKey,
      httpStatus: 200,
      requestId: context.get("requestId"),
    }),
    200,
  );
}
