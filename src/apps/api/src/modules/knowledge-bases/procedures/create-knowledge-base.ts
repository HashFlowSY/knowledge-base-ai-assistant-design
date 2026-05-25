import type { Context } from "hono";

import type { ApiEnv } from "../../../contracts";
import {
  createSuccessResponse,
  readJsonBody,
  respondWithServiceError,
  respondWithValidationError,
} from "../../../http";
import {
  requireAdminKnowledgeBaseSession,
  respondAfterUnresolvedKnowledgeBaseRateLimit,
  toKnowledgeActor,
  validateJsonMutationRequest,
} from "../../../guards";
import type { KnowledgeBaseRouteDependencies } from "../dependencies";
import { createKnowledgeBaseInputSchema } from "../types";

export async function createKnowledgeBaseProcedure(
  context: Context<ApiEnv>,
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
  const parsed = createKnowledgeBaseInputSchema.safeParse(body);
  if (!parsed.success) {
    return respondWithValidationError(context, parsed.error);
  }

  const result = await dependencies.knowledgeBaseService.createKnowledgeBase({
    actor: toKnowledgeActor(authResult.actor),
    body: parsed.data,
  });
  if (!result.ok) {
    return respondWithServiceError(context, result);
  }

  return context.json(
    createSuccessResponse({
      data: result.knowledgeBase,
      httpStatus: 201,
      requestId: context.get("requestId"),
    }),
    201,
  );
}
