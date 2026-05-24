import type { Context } from "hono";

import {
  modelServiceKindSchema,
  saveProviderConfigInputSchema,
} from "@kb/ai-providers";

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
import type { ProviderRouteDependencies } from "../types";

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
    kind: parsedKind.data,
    requestId: context.get("requestId"),
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
  | {
      ok: false;
      code: string;
      httpStatus: 400 | 401 | 403 | 404 | 409 | 429 | 500;
      message: string;
    }
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
