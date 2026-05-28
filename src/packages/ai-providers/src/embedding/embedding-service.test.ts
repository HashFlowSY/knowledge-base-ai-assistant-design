import { describe, expect, it } from "vitest";

import {
  createEmbeddingService,
  createInMemoryProviderConfigRepository,
  createProviderConfigService,
} from "../service";
import {
  actor,
  alwaysPassConnectionTester,
  createEmbeddingFetch,
  createVector,
  embeddingSaveBody,
  encryptionKey,
} from "../testing/service.test-helpers";

describe("embedding service", () => {
  it("fails when the tenant has no enabled embedding provider", async () => {
    const embeddingService = createEmbeddingService({
      encryptionKey,
      fetcher: createEmbeddingFetch({
        responseBody: { data: [] },
      }),
      repository: createInMemoryProviderConfigRepository(),
    });

    await expect(
      embeddingService.embed({
        inputs: ["hello"],
        requestId: "req_embed_missing",
        tenantId: "tenant_1",
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: "EMBEDDING_PROVIDER_NOT_CONFIGURED",
      retryable: true,
    });
  });

  it("fails when the configured embedding provider is disabled", async () => {
    const repository = createInMemoryProviderConfigRepository();
    const configService = createProviderConfigService({
      connectionTester: alwaysPassConnectionTester(),
      encryptionKey,
      repository,
    });
    await configService.saveProviderConfig({
      actor,
      body: embeddingSaveBody({
        apiKey: { mode: "plaintext", value: "sk-disabled" },
        status: "disabled",
      }),
      kind: "embedding",
      requestId: "req_disabled_embedding",
    });
    const embeddingService = createEmbeddingService({
      encryptionKey,
      fetcher: createEmbeddingFetch({
        responseBody: { data: [] },
      }),
      repository,
    });

    await expect(
      embeddingService.embed({
        inputs: ["hello"],
        requestId: "req_embed_disabled",
        tenantId: "tenant_1",
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: "EMBEDDING_PROVIDER_NOT_CONFIGURED",
      retryable: true,
    });
  });

  it("generates OpenAI-compatible embeddings with provider and model metadata", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const repository = createInMemoryProviderConfigRepository();
    const configService = createProviderConfigService({
      connectionTester: alwaysPassConnectionTester(),
      encryptionKey,
      repository,
    });
    const saved = await configService.saveProviderConfig({
      actor,
      body: embeddingSaveBody({
        apiKey: { mode: "plaintext", value: "sk-live-embedding-key" },
      }),
      kind: "embedding",
      requestId: "req_save_embedding",
    });
    const embeddingService = createEmbeddingService({
      encryptionKey,
      fetcher: createEmbeddingFetch({
        calls,
        responseBody: {
          data: [
            { embedding: createVector(0.1), index: 0 },
            { embedding: createVector(0.2), index: 1 },
          ],
          usage: {
            total_tokens: 7,
          },
        },
      }),
      repository,
    });

    const result = await embeddingService.embed({
      inputs: ["alpha", "beta"],
      requestId: "req_embed",
      tenantId: "tenant_1",
    });

    expect(result).toMatchObject({
      ok: true,
      dimensions: 1_024,
      modelId: "text-embedding-v4",
      provider: "openai-compatible",
      usage: {
        totalTokens: 7,
      },
      vectors: [createVector(0.1), createVector(0.2)],
    });
    if (result.ok && saved.ok) {
      expect(result.providerConfigId).toBe(saved.provider.id);
    }
    expect(JSON.stringify(result)).not.toContain("sk-live-embedding-key");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings");
    expect(calls[0]?.init.headers).toMatchObject({
      authorization: "Bearer sk-live-embedding-key",
    });
    expect(JSON.parse(String(calls[0]?.init.body))).toMatchObject({
      dimensions: 1024,
      encoding_format: "float",
      input: ["alpha", "beta"],
      model: "text-embedding-v4",
    });
  });
});
