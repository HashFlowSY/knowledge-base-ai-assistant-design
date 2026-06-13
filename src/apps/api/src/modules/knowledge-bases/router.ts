import { Hono } from "hono";

import type { ApiEnv } from "../../contracts";
import {
  createAdminKnowledgeBaseSessionMiddleware,
  createJsonBodyValidationMiddleware,
  createJsonMutationGuardMiddleware,
  createKnowledgeBaseRejectionRateLimitHandler,
  createKnowledgeBaseSessionMiddleware,
  createParamValidationMiddleware,
  createQueryValidationMiddleware,
} from "../../middleware";
import { createKnowledgeBaseProcedure } from "./procedures/create-knowledge-base";
import { getKnowledgeBaseProcedure } from "./procedures/get-knowledge-base";
import { listKnowledgeBasesProcedure } from "./procedures/list-knowledge-bases";
import { updateKnowledgeBaseProcedure } from "./procedures/update-knowledge-base";
import type { KnowledgeBaseRouteDependencies } from "./dependencies";
import {
  createKnowledgeBaseInputSchema,
  knowledgeBaseParamsSchema,
  knowledgeBaseListQuerySchema,
  updateKnowledgeBaseInputSchema,
} from "./types";

export function createKnowledgeBasesRouter(
  dependencies: KnowledgeBaseRouteDependencies,
): Hono<ApiEnv> {
  const router = new Hono<ApiEnv>();
  const requireSession = createKnowledgeBaseSessionMiddleware({
    authService: dependencies.authService,
    rateLimiter: dependencies.rateLimiter,
  });
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

  router.get(
    "/api/knowledge-bases",
    requireSession,
    createQueryValidationMiddleware(
      "knowledgeBaseListQuery",
      knowledgeBaseListQuerySchema,
    ),
    (context) => listKnowledgeBasesProcedure(context, dependencies),
  );
  router.post(
    "/api/knowledge-bases",
    jsonMutationGuard,
    requireAdmin,
    createJsonBodyValidationMiddleware(
      "createKnowledgeBaseBody",
      createKnowledgeBaseInputSchema,
    ),
    (context) => createKnowledgeBaseProcedure(context, dependencies),
  );
  router.get(
    "/api/knowledge-bases/:knowledgeBaseId",
    requireSession,
    createParamValidationMiddleware("knowledgeBaseParams", knowledgeBaseParamsSchema),
    (context) => getKnowledgeBaseProcedure(context, dependencies),
  );
  router.patch(
    "/api/knowledge-bases/:knowledgeBaseId",
    jsonMutationGuard,
    requireAdmin,
    createParamValidationMiddleware("knowledgeBaseParams", knowledgeBaseParamsSchema),
    createJsonBodyValidationMiddleware(
      "updateKnowledgeBaseBody",
      updateKnowledgeBaseInputSchema,
    ),
    (context) => updateKnowledgeBaseProcedure(context, dependencies),
  );

  return router;
}
