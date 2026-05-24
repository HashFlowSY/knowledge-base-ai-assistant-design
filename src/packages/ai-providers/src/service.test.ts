import { describe, expect, it } from "vitest";

import { normalizeAes256GcmKey } from "@kb/security";

import {
  createProviderConnectionTester,
  createInMemoryProviderConfigRepository,
  createProviderConfigService,
  type ProviderConnectionTestInput,
} from "./service";

const actor = {
  user: { id: "admin_1", name: "管理员", email: "admin@example.com" },
  tenant: { id: "tenant_1" },
  role: "admin" as const,
};

const encryptionKey = normalizeAes256GcmKey(
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
);

describe("provider config service", () => {
  it("returns one redacted summary slot for each fixed model service kind", async () => {
    const service = createProviderConfigService({
      connectionTester: alwaysPassConnectionTester(),
      encryptionKey,
      repository: createInMemoryProviderConfigRepository(),
    });

    await expect(service.listProviderConfigs({ actor })).resolves.toMatchObject({
      ok: true,
      providers: [
        { kind: "chat", configured: false },
        { kind: "embedding", configured: false },
        { kind: "rerank", configured: false },
      ],
    });
  });

  it("requires a plaintext candidate API key before the first save", async () => {
    const service = createProviderConfigService({
      connectionTester: alwaysPassConnectionTester(),
      encryptionKey,
      repository: createInMemoryProviderConfigRepository(),
    });

    await expect(
      service.saveProviderConfig({
        actor,
        body: saveBody({ apiKey: { mode: "keep" } }),
        kind: "chat",
        requestId: "req_first_keep",
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: "VALIDATION_ERROR",
      httpStatus: 400,
    });
  });

  it("does not write config or secret records when the connection test fails", async () => {
    const repository = createInMemoryProviderConfigRepository();
    const service = createProviderConfigService({
      connectionTester: async () => ({
        ok: false,
        code: "PROVIDER_AUTH_FAILED",
        message: "模型服务连接测试失败。",
      }),
      encryptionKey,
      repository,
    });

    await expect(
      service.saveProviderConfig({
        actor,
        body: saveBody({
          apiKey: { mode: "plaintext", value: "sk-invalid" },
        }),
        kind: "chat",
        requestId: "req_connection_failed",
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: "FORBIDDEN",
      httpStatus: 403,
    });
    await expect(service.listProviderConfigs({ actor })).resolves.toMatchObject({
      ok: true,
      providers: [
        { kind: "chat", configured: false },
        { kind: "embedding", configured: false },
        { kind: "rerank", configured: false },
      ],
    });
    expect(repository.inspect().configs).toHaveLength(0);
    expect(repository.inspect().secrets).toHaveLength(0);
  });

  it("upserts by tenant and kind without duplicating configs or rotating an identical key", async () => {
    const repository = createInMemoryProviderConfigRepository();
    const service = createProviderConfigService({
      connectionTester: alwaysPassConnectionTester(),
      encryptionKey,
      repository,
    });

    const created = await service.saveProviderConfig({
      actor,
      body: saveBody({
        apiKey: { mode: "plaintext", value: "sk-live-provider-key" },
      }),
      kind: "chat",
      requestId: "req_create",
    });
    const repeated = await service.saveProviderConfig({
      actor,
      body: saveBody({
        apiKey: { mode: "plaintext", value: "sk-live-provider-key" },
      }),
      kind: "chat",
      requestId: "req_repeat",
    });

    expect(created).toMatchObject({ ok: true });
    expect(repeated).toMatchObject({ ok: true });
    if (created.ok && repeated.ok) {
      expect(repeated.provider.id).toBe(created.provider.id);
      expect(repeated.provider.keyVersion).toBe(created.provider.keyVersion);
      expect(repeated.provider.maskedKey).toBe("[REDACTED]-key");
    }
    expect(repository.inspect().configs).toHaveLength(1);
    expect(repository.inspect().secrets).toHaveLength(1);
  });

  it("keeps the existing key on update and rotates metadata for a new key", async () => {
    const testedKeys: string[] = [];
    const repository = createInMemoryProviderConfigRepository();
    const service = createProviderConfigService({
      connectionTester: async (input) => {
        testedKeys.push(input.apiKey);
        return { ok: true };
      },
      encryptionKey,
      repository,
    });

    const created = await service.saveProviderConfig({
      actor,
      body: saveBody({
        apiKey: { mode: "plaintext", value: "sk-first-key" },
      }),
      kind: "embedding",
      requestId: "req_create_embedding",
    });
    const kept = await service.saveProviderConfig({
      actor,
      body: saveBody({
        apiKey: { mode: "keep" },
        modelId: "text-embedding-v2",
      }),
      kind: "embedding",
      requestId: "req_keep_embedding",
    });
    const rotated = await service.saveProviderConfig({
      actor,
      body: saveBody({
        apiKey: { mode: "plaintext", value: "sk-second-key" },
        modelId: "text-embedding-v3",
      }),
      kind: "embedding",
      requestId: "req_rotate_embedding",
    });

    expect(created).toMatchObject({ ok: true });
    expect(kept).toMatchObject({ ok: true });
    expect(rotated).toMatchObject({ ok: true });
    if (created.ok && kept.ok && rotated.ok) {
      expect(kept.provider.id).toBe(created.provider.id);
      expect(kept.provider.keyVersion).toBe("v1");
      expect(rotated.provider.id).toBe(created.provider.id);
      expect(rotated.provider.keyVersion).toBe("v2");
      expect(rotated.provider.maskedKey).toBe("[REDACTED]-key");
    }
    expect(testedKeys).toEqual(["sk-first-key", "sk-first-key", "sk-second-key"]);
    expect(repository.inspect().configs).toHaveLength(1);
    expect(repository.inspect().secrets).toHaveLength(2);
  });
});

describe("provider connection tester", () => {
  it("checks DeepSeek credentials with the models endpoint instead of the bare base URL", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const tester = createProviderConnectionTester({
      fetcher: async (url, init) => {
        calls.push({ url: String(url), init: init ?? {} });
        return new Response("{}", { status: 200 });
      },
    });

    await expect(
      tester(
        connectionInput({
          baseUrl: "https://api.deepseek.com",
          kind: "chat",
          modelId: "deepseek-chat",
          provider: "deepseek",
        }),
      ),
    ).resolves.toEqual({ ok: true });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://api.deepseek.com/models");
    expect(calls[0]?.init.method).toBe("GET");
    expect(calls[0]?.init.body).toBeUndefined();
    expect(calls[0]?.init.headers).toMatchObject({
      authorization: "Bearer sk-live-provider-key",
    });
  });

  it("checks Alibaba Bailian credentials with each slot's real capability endpoint", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const tester = createProviderConnectionTester({
      fetcher: async (url, init) => {
        calls.push({ url: String(url), init: init ?? {} });
        return new Response("{}", { status: 200 });
      },
    });

    await expect(
      tester(
        connectionInput({
          baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
          kind: "chat",
          modelId: "qwen-plus",
          provider: "阿里云百炼",
        }),
      ),
    ).resolves.toEqual({ ok: true });
    await expect(
      tester(
        connectionInput({
          baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
          kind: "embedding",
          modelId: "text-embedding-v4",
          provider: "dashscope",
        }),
      ),
    ).resolves.toEqual({ ok: true });
    await expect(
      tester(
        connectionInput({
          baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
          kind: "rerank",
          modelId: "qwen3-rerank",
          provider: "bailian",
        }),
      ),
    ).resolves.toEqual({ ok: true });

    expect(calls.map((call) => call.url)).toEqual([
      "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
      "https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings",
      "https://dashscope.aliyuncs.com/compatible-api/v1/reranks",
    ]);
    expect(calls.map((call) => call.init.method)).toEqual(["POST", "POST", "POST"]);
    expect(calls.map((call) => call.init.headers)).toEqual([
      {
        accept: "application/json",
        authorization: "Bearer sk-live-provider-key",
        "content-type": "application/json",
      },
      {
        accept: "application/json",
        authorization: "Bearer sk-live-provider-key",
        "content-type": "application/json",
      },
      {
        accept: "application/json",
        authorization: "Bearer sk-live-provider-key",
        "content-type": "application/json",
      },
    ]);
    expect(calls.map((call) => JSON.parse(String(call.init.body)))).toEqual([
      {
        max_tokens: 1,
        messages: [{ role: "user", content: "ping" }],
        model: "qwen-plus",
        stream: false,
      },
      {
        dimensions: 1024,
        encoding_format: "float",
        input: "ping",
        model: "text-embedding-v4",
      },
      {
        documents: ["ping", "pong"],
        model: "qwen3-rerank",
        query: "ping",
        top_n: 1,
      },
    ]);
  });

  it("checks DashScope native embedding when the configured base URL is api/v1", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const tester = createProviderConnectionTester({
      fetcher: async (url, init) => {
        calls.push({ url: String(url), init: init ?? {} });
        return new Response("{}", { status: 200 });
      },
    });

    await expect(
      tester(
        connectionInput({
          baseUrl: "https://dashscope.aliyuncs.com/api/v1",
          kind: "embedding",
          modelId: "text-embedding-v3",
          provider: "dashscope",
        }),
      ),
    ).resolves.toEqual({ ok: true });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(
      "https://dashscope.aliyuncs.com/api/v1/services/embeddings/text-embedding/text-embedding",
    );
    expect(calls[0]?.init.method).toBe("POST");
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      model: "text-embedding-v3",
      input: {
        texts: ["ping"],
      },
      parameters: {
        dimension: 1024,
        output_type: "dense",
      },
    });
  });

  it("checks gte-rerank-v2 with DashScope native rerank endpoint and payload", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const tester = createProviderConnectionTester({
      fetcher: async (url, init) => {
        calls.push({ url: String(url), init: init ?? {} });
        return new Response("{}", { status: 200 });
      },
    });

    await expect(
      tester(
        connectionInput({
          baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
          kind: "rerank",
          modelId: "gte-rerank-v2",
          provider: "gte-rerank-v2",
        }),
      ),
    ).resolves.toEqual({ ok: true });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(
      "https://dashscope.aliyuncs.com/api/v1/services/rerank/text-rerank/text-rerank",
    );
    expect(calls[0]?.init.method).toBe("POST");
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      model: "gte-rerank-v2",
      input: {
        query: "ping",
        documents: ["ping", "pong"],
      },
      parameters: {
        top_n: 1,
      },
    });
  });

  it("normalizes failed provider status codes without leaking provider response bodies", async () => {
    const tester = createProviderConnectionTester({
      fetcher: async () =>
        new Response(JSON.stringify({ error: { message: "raw secret detail" } }), {
          status: 401,
        }),
    });

    await expect(
      tester(
        connectionInput({
          baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
          kind: "embedding",
          modelId: "text-embedding-v4",
          provider: "dashscope",
        }),
      ),
    ).resolves.toEqual({
      ok: false,
      code: "PROVIDER_AUTH_FAILED",
      message: "模型服务认证失败。",
    });
  });
});

function saveBody(input: {
  apiKey: { mode: "keep" } | { mode: "plaintext"; value: string };
  modelId?: string;
}) {
  return {
    displayName: "主模型服务",
    provider: "deepseek",
    modelId: input.modelId ?? "deepseek-chat",
    baseUrl: "https://api.deepseek.com",
    status: "enabled" as const,
    apiKey: input.apiKey,
  };
}

function alwaysPassConnectionTester(): (input: ProviderConnectionTestInput) => Promise<{
  ok: true;
}> {
  return async () => ({ ok: true });
}

function connectionInput(
  input: Partial<ProviderConnectionTestInput>,
): ProviderConnectionTestInput {
  return {
    apiKey: "sk-live-provider-key",
    baseUrl: "https://api.deepseek.com",
    kind: "chat",
    modelId: "deepseek-chat",
    provider: "deepseek",
    requestId: "req_connection_test",
    tenantId: "tenant_1",
    ...input,
  };
}
