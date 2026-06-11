import { Hono } from "hono";
import { z } from "zod";

import type { ApiEnv } from "../../contracts";
import {
  createAdminKnowledgeBaseSessionMiddleware,
  createJsonBodyValidationMiddleware,
  createJsonMutationGuardMiddleware,
  createKnowledgeBaseRejectionRateLimitHandler,
  createParamValidationMiddleware,
} from "../../middleware";
import { listProvidersProcedure } from "./procedures/list-providers";
import { providerPublicKeyProcedure } from "./procedures/provider-public-key";
import { saveProviderProcedure } from "./procedures/save-provider";
import type { ProviderRouteDependencies } from "./dependencies";
import { modelServiceKindSchema, saveProviderConfigInputSchema } from "./types";

const providerKindParamSchema = z.object({
  kind: modelServiceKindSchema,
});

export function createProvidersRouter(
  dependencies: ProviderRouteDependencies,
): Hono<ApiEnv> {
  const router = new Hono<ApiEnv>();
  const requireAdmin = createAdminKnowledgeBaseSessionMiddleware({
    auditService: dependencies.auditService,
    authService: dependencies.authService,
    rateLimiter: dependencies.rateLimiter,
  });
  const rejectWithKnowledgeBaseRateLimit =
    createKnowledgeBaseRejectionRateLimitHandler(dependencies.rateLimiter);
  const jsonMutationGuard = createJsonMutationGuardMiddleware({
    allowedOrigins: dependencies.allowedOrigins,
    onRejected: rejectWithKnowledgeBaseRateLimit,
  });

  router.get("/api/providers", requireAdmin, (context) =>
    listProvidersProcedure(context, dependencies),
  );
  router.get("/api/providers/public-key", requireAdmin, (context) =>
    providerPublicKeyProcedure(context, dependencies),
  );
  router.put(
    "/api/providers/:kind",
    jsonMutationGuard,
    requireAdmin,
    createParamValidationMiddleware("providerKindParams", providerKindParamSchema),
    createJsonBodyValidationMiddleware(
      "saveProviderBody",
      saveProviderConfigInputSchema,
    ),
    (context) => saveProviderProcedure(context, dependencies),
  );

  return router;
}
