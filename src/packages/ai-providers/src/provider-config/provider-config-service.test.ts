import { describe, expect, it } from "vitest";

import {
  createInMemoryProviderConfigRepository,
  createProviderConfigService,
} from "../service";
import {
  actor,
  alwaysPassConnectionTester,
  encryptionKey,
  saveBody,
} from "../testing/service.test-helpers";

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
