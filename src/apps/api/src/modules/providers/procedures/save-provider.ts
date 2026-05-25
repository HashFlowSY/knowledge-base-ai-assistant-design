import type { Context } from "hono";

import type { ApiEnv, ApiServiceError } from "../../../contracts";
import {
  createSuccessResponse,
  readJsonBody,
  respondWithServiceError,
  respondWithValidationError,
} from "../../../http";
import {
  getRequestIpSummary,
  requireAdminKnowledgeBaseSession,
  respondAfterUnresolvedKnowledgeBaseRateLimit,
  validateJsonMutationRequest,
} from "../../../guards";
import type { ProviderRouteDependencies } from "../dependencies";
import {
  modelServiceKindSchema,
  saveProviderConfigInputSchema,
} from "../types";

type SaveProviderContext = Context<ApiEnv, "/api/providers/:kind">;

export async function saveProviderProcedure(
  context: SaveProviderContext,
  dependencies: ProviderRouteDependencies,
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

  const parsedKind = modelServiceKindSchema.safeParse(context.req.param("kind"));
  if (!parsedKind.success) {
    return respondWithValidationError(context, parsedKind.error);
  }

  const body = await readJsonBody(context.req.raw);
  const parsedBody = saveProviderConfigInputSchema.safeParse(body);
  if (!parsedBody.success) {
    return respondWithValidationError(context, parsedBody.error);
  }

  const apiKeyResult =
    parsedBody.data.apiKey.mode === "keep"
      ? ({ ok: true, value: { mode: "keep" } } as const)
      : await decryptProviderApiKey(context, dependencies, {
          ciphertext: parsedBody.data.apiKey.ciphertext,
          keyId: parsedBody.data.apiKey.keyId,
        });
  if (!apiKeyResult.ok) {
    return respondWithServiceError(context, apiKeyResult);
  }

  const result = await dependencies.providerConfigService.saveProviderConfig({
    actor: authResult.actor,
    body: {
      baseUrl: parsedBody.data.baseUrl,
      displayName: parsedBody.data.displayName,
      modelId: parsedBody.data.modelId,
      provider: parsedBody.data.provider,
      status: parsedBody.data.status,
      apiKey: apiKeyResult.value,
    },
    ipSummary: getRequestIpSummary(context),
    kind: parsedKind.data,
    requestId: context.get("requestId"),
    userAgentSummary: context.req.header("user-agent") ?? null,
  });
  if (!result.ok) {
    return respondWithServiceError(context, result);
  }

  return context.json(
    createSuccessResponse({
      data: result.provider,
      httpStatus: 200,
      requestId: context.get("requestId"),
    }),
    200,
  );
}

async function decryptProviderApiKey(
  _context: SaveProviderContext,
  dependencies: ProviderRouteDependencies,
  input: {
    ciphertext: string;
    keyId: string;
  },
): Promise<
  | { ok: true; value: { mode: "plaintext"; value: string } }
  | ApiServiceError
> {
  const decrypted = await dependencies.providerTransportKeyService.decryptApiKey(input);
  if (!decrypted.ok) {
    return decrypted;
  }

  return {
    ok: true,
    value: {
      mode: "plaintext",
      value: decrypted.plaintext,
    },
  };
}
