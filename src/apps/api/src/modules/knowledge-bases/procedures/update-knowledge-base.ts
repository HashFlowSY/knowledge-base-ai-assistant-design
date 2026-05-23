import type { Context } from "hono";

import { updateKnowledgeBaseInputSchema } from "@kb/knowledge";

import type { ApiEnv } from "../../../contracts";
import { createSuccessResponse, readJsonBody } from "../../../http";
import {
  respondWithServiceError,
  respondWithValidationError,
  validateJsonMutationRequest,
} from "../../../request-helpers";
import {
  requireAdminKnowledgeBaseSession,
  respondAfterUnresolvedKnowledgeBaseRateLimit,
} from "../../../session-guards";
import type { KnowledgeBaseRouteDependencies } from "../types";

type UpdateKnowledgeBaseContext = Context<
  ApiEnv,
  "/api/knowledge-bases/:knowledgeBaseId"
>;

export async function updateKnowledgeBaseProcedure(
  context: UpdateKnowledgeBaseContext,
  dependencies: KnowledgeBaseRouteDependencies,
): Promise<Response> {
  const csrfResponse = validateJsonMutationRequest(
    context,
    dependencies.allowedOrigins,
  );
  if (csrfResponse !== null) {
    return respondAfterUnresolvedKnowledgeBaseRateLimit(
      context,
      dependencies.rateLimiter,
      csrfResponse,
    );
  }

  const authResult = await requireAdminKnowledgeBaseSession(
    context,
    dependencies.auditService,
    dependencies.authService,
    dependencies.rateLimiter,
  );
  if (!authResult.ok) {
    return authResult.response;
  }

  const body = await readJsonBody(context.req.raw);
  const parsed = updateKnowledgeBaseInputSchema.safeParse(body);
  if (!parsed.success) {
    return respondWithValidationError(context, parsed.error);
  }

  const result = await dependencies.knowledgeBaseService.updateKnowledgeBase({
    actor: authResult.actor,
    body: parsed.data,
    knowledgeBaseId: context.req.param("knowledgeBaseId"),
  });
  if (!result.ok) {
    return respondWithServiceError(context, result);
  }

  return context.json(
    createSuccessResponse({
      data: result.knowledgeBase,
      httpStatus: 200,
      requestId: context.get("requestId"),
    }),
    200,
  );
}
