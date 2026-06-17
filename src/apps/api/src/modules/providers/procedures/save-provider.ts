import type { Context } from "hono";

import type { ApiEnv } from "../../../contracts";
import { createSuccessResponse } from "../../../http";
import {
  getRequestIpSummary,
} from "../../../guards";
import { getRequiredActor, getValidatedInput } from "../../../middleware";
import type { ProviderRouteDependencies } from "../dependencies";
import type { ModelServiceKind, SaveProviderConfigInput } from "../types";

type SaveProviderContext = Context<ApiEnv, "/api/providers/:kind">;

export async function saveProviderProcedure(
  context: SaveProviderContext,
  dependencies: ProviderRouteDependencies,
): Promise<Response> {
  const params = getValidatedInput<{ kind: ModelServiceKind }>(
    context,
    "providerKindParams",
  );
  const body = getValidatedInput<SaveProviderConfigInput>(
    context,
    "saveProviderBody",
  );

  const apiKeyResult =
    body.apiKey.mode === "keep"
      ? ({ ok: true, value: { mode: "keep" } } as const)
      : await decryptProviderApiKey(context, dependencies, {
          ciphertext: body.apiKey.ciphertext,
          keyId: body.apiKey.keyId,
        });

  const result = await dependencies.providerConfigService.saveProviderConfig({
    actor: getRequiredActor(context),
    body: {
      baseUrl: body.baseUrl,
      displayName: body.displayName,
      modelId: body.modelId,
      provider: body.provider,
      status: body.status,
      apiKey: apiKeyResult.value,
    },
    ipSummary: getRequestIpSummary(context),
    kind: params.kind,
    requestId: context.get("requestId"),
    userAgentSummary: context.req.header("user-agent") ?? null,
  });

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
): Promise<{ ok: true; value: { mode: "plaintext"; value: string } }> {
  const decrypted = await dependencies.providerTransportKeyService.decryptApiKey(input);

  return {
    ok: true,
    value: {
      mode: "plaintext",
      value: decrypted.plaintext,
    },
  };
}
