import type { Context } from "hono";

import type { ApiEnv } from "../../../contracts";
import { createSuccessResponse } from "../../../http";
import { respondWithServiceError } from "../../../request-helpers";
import { requireAdminKnowledgeBaseSession } from "../../../session-guards";
import type { ProviderRouteDependencies } from "../types";

export async function listProvidersProcedure(
  context: Context<ApiEnv>,
  dependencies: ProviderRouteDependencies,
): Promise<Response> {
  const authResult = await requireAdminKnowledgeBaseSession(
    context,
    dependencies.auditService,
    dependencies.authService,
    dependencies.rateLimiter,
  );
  if (!authResult.ok) {
    return authResult.response;
  }

  const result = await dependencies.providerConfigService.listProviderConfigs({
    actor: authResult.actor,
  });
  if (!result.ok) {
    return respondWithServiceError(context, result);
  }

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
