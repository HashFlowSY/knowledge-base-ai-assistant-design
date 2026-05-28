import { z } from "zod";

import { normalizeProviderConnectionResponse } from "../connection/connection-tester";
import {
  createDashScopeEndpointUrl,
  createEndpointUrl,
  dashScopeNativeEmbeddingPath,
  isDashScopeNativeBaseUrl,
  isDashScopeProvider,
} from "../provider-http/provider-endpoints";
import { decryptExistingApiKey } from "../provider-config/provider-secrets";
import { isAbortError } from "../shared/provider-service-errors";
import type {
  EmbeddingService,
  EmbeddingServiceOptions,
  EmbeddingServiceResult,
  EmbeddingUsage,
  ProviderConnectionTestResult,
} from "../shared/service-types";

interface EmbeddingRequest {
  url: string;
  body: Record<string, unknown>;
}

const embeddingVectorSchema = z.array(z.number()).length(1024);
const openAiEmbeddingResponseSchema = z.object({
  data: z.array(
    z.object({
      embedding: embeddingVectorSchema,
      index: z.number().int().min(0).optional(),
    }),
  ),
  usage: z
    .object({
      total_tokens: z.number().int().nonnegative().optional(),
    })
    .optional(),
});
const dashScopeEmbeddingResponseSchema = z.object({
  output: z.object({
    embeddings: z.array(
      z.object({
        embedding: embeddingVectorSchema,
        text_index: z.number().int().min(0).optional(),
      }),
    ),
  }),
  usage: z
    .object({
      total_tokens: z.number().int().nonnegative().optional(),
    })
    .optional(),
});

export function createEmbeddingService(
  options: EmbeddingServiceOptions,
): EmbeddingService {
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? 30_000;

  return {
    async embed(input): Promise<EmbeddingServiceResult> {
      const config = await options.repository.getProviderConfig({
        kind: "embedding",
        tenantId: input.tenantId,
      });
      if (
        config === null ||
        config.status !== "enabled" ||
        config.secretRecordId === null
      ) {
        return createEmbeddingProviderNotConfiguredResult();
      }

      const apiKeyResult = await decryptExistingApiKey({
        actor: {
          role: "admin",
          tenant: { id: input.tenantId },
          user: { id: "system" },
        },
        encryptionKey: options.encryptionKey,
        existingConfig: config,
        repository: options.repository,
      });
      if (!apiKeyResult.ok || apiKeyResult.apiKey === null) {
        return {
          ok: false,
          code: "PROVIDER_UNKNOWN_ERROR",
          message: "向量模型密钥不可用。",
          retryable: false,
        };
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const request = createEmbeddingRequest({
          apiKey: apiKeyResult.apiKey,
          baseUrl: config.baseUrl,
          inputs: input.inputs,
          modelId: config.modelId,
          provider: config.provider,
        });
        const response = await fetcher(request.url, {
          body: JSON.stringify(request.body),
          headers: {
            accept: "application/json",
            authorization: `Bearer ${apiKeyResult.apiKey}`,
            "content-type": "application/json",
            "x-request-id": input.requestId,
          },
          method: "POST",
          signal: controller.signal,
        });
        if (!response.ok) {
          return mapEmbeddingProviderError(
            normalizeProviderConnectionResponse(response.status),
          );
        }

        const parsed = parseEmbeddingResponse(await response.json(), input.inputs.length);
        if (!parsed.ok) {
          return parsed;
        }

        const providerRequestId = response.headers.get("x-request-id");

        return {
          ok: true,
          dimensions: parsed.vectors[0]?.length ?? 0,
          modelId: config.modelId,
          provider: config.provider,
          providerConfigId: config.id,
          vectors: parsed.vectors,
          ...(parsed.usage === undefined ? {} : { usage: parsed.usage }),
          ...(providerRequestId === null ? {} : { providerRequestId }),
        };
      } catch (error) {
        if (isAbortError(error)) {
          return {
            ok: false,
            code: "PROVIDER_TIMEOUT",
            message: "向量模型调用超时。",
            retryable: true,
          };
        }

        return {
          ok: false,
          code: "PROVIDER_UNAVAILABLE",
          message: "向量模型暂时不可用。",
          retryable: true,
        };
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

function createEmbeddingRequest(input: {
  apiKey: string;
  baseUrl: string;
  inputs: string[];
  modelId: string;
  provider: string;
}): EmbeddingRequest {
  if (
    isDashScopeProvider({
      apiKey: input.apiKey,
      baseUrl: input.baseUrl,
      kind: "embedding",
      modelId: input.modelId,
      provider: input.provider,
      requestId: "embedding",
      tenantId: "tenant",
    }) &&
    isDashScopeNativeBaseUrl(input.baseUrl)
  ) {
    return {
      body: {
        model: input.modelId,
        input: {
          texts: input.inputs,
        },
        parameters: {
          dimension: 1024,
          output_type: "dense",
        },
      },
      url: createDashScopeEndpointUrl(input.baseUrl, dashScopeNativeEmbeddingPath),
    };
  }

  return {
    body: {
      dimensions: 1024,
      encoding_format: "float",
      input: input.inputs,
      model: input.modelId,
    },
    url: createEndpointUrl(input.baseUrl, "/embeddings"),
  };
}

function parseEmbeddingResponse(
  value: unknown,
  expectedCount: number,
):
  | { ok: true; vectors: number[][]; usage?: EmbeddingUsage }
  | Extract<EmbeddingServiceResult, { ok: false }> {
  const openAiResponse = openAiEmbeddingResponseSchema.safeParse(value);
  if (openAiResponse.success) {
    const vectors = [...openAiResponse.data.data]
      .sort((left, right) => (left.index ?? 0) - (right.index ?? 0))
      .map((item) => item.embedding);
    const usage = normalizeEmbeddingUsage(openAiResponse.data.usage?.total_tokens);
    return validateEmbeddingVectors({
      expectedCount,
      ...(usage === undefined ? {} : { usage }),
      vectors,
    });
  }

  const dashScopeResponse = dashScopeEmbeddingResponseSchema.safeParse(value);
  if (dashScopeResponse.success) {
    const vectors = [...dashScopeResponse.data.output.embeddings]
      .sort((left, right) => (left.text_index ?? 0) - (right.text_index ?? 0))
      .map((item) => item.embedding);
    const usage = normalizeEmbeddingUsage(
      dashScopeResponse.data.usage?.total_tokens,
    );
    return validateEmbeddingVectors({
      expectedCount,
      ...(usage === undefined ? {} : { usage }),
      vectors,
    });
  }

  return {
    ok: false,
    code: "PROVIDER_INVALID_REQUEST",
    message: "向量模型返回格式无效。",
    retryable: false,
  };
}

function validateEmbeddingVectors(input: {
  expectedCount: number;
  vectors: number[][];
  usage?: EmbeddingUsage;
}):
  | { ok: true; vectors: number[][]; usage?: EmbeddingUsage }
  | Extract<EmbeddingServiceResult, { ok: false }> {
  if (input.vectors.length !== input.expectedCount) {
    return {
      ok: false,
      code: "PROVIDER_INVALID_REQUEST",
      message: "向量模型返回数量与输入不一致。",
      retryable: false,
    };
  }

  return {
    ok: true,
    vectors: input.vectors,
    ...(input.usage === undefined ? {} : { usage: input.usage }),
  };
}

function normalizeEmbeddingUsage(totalTokens: number | undefined):
  | EmbeddingUsage
  | undefined {
  return totalTokens === undefined ? undefined : { totalTokens };
}

function createEmbeddingProviderNotConfiguredResult(): Extract<
  EmbeddingServiceResult,
  { ok: false }
> {
  return {
    ok: false,
    code: "EMBEDDING_PROVIDER_NOT_CONFIGURED",
    message: "未配置可用的向量模型服务。",
    retryable: true,
  };
}

function mapEmbeddingProviderError(
  result: ProviderConnectionTestResult,
): Extract<EmbeddingServiceResult, { ok: false }> {
  if (result.ok) {
    return {
      ok: false,
      code: "PROVIDER_UNKNOWN_ERROR",
      message: "向量模型调用失败。",
      retryable: true,
    };
  }

  return {
    ok: false,
    code: result.code,
    message: result.message,
    retryable:
      result.code === "PROVIDER_RATE_LIMITED" ||
      result.code === "PROVIDER_TIMEOUT" ||
      result.code === "PROVIDER_UNAVAILABLE" ||
      result.code === "PROVIDER_UNKNOWN_ERROR",
  };
}
