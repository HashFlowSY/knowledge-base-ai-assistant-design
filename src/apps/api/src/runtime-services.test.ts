import { describe, expect, it } from "vitest";

import { createApiRuntimeServices } from "./runtime-services";

describe("api runtime services", () => {
  it("wires auth service, user service, and rate limiter from runtime config", async () => {
    const runtime = createApiRuntimeServices({
      appBaseUrl: "http://localhost:3000",
      appEncryptionKey: "0123456789abcdef0123456789abcdef",
      betterAuthSecret: "0123456789abcdef0123456789abcdef",
      databaseUrl: "postgres://kb:kb@localhost:5432/kb",
      objectStorage: {
        accessKeyId: "minioadmin",
        bucket: "kb-source",
        endpoint: "http://localhost:9000",
        forcePathStyle: true,
        region: "local",
        secretAccessKey: "minioadmin",
      },
      redisUrl: "redis://localhost:6379",
      uploadConfig: {
        concurrencyPerActor: 2,
        concurrencyPerTenant: 10,
        maxFileBytes: 8 * 1024 * 1024,
        rateLimitPerMinute: 20,
        requestOverheadBytes: 64 * 1024,
      },
    });

    expect(runtime.allowedOrigins).toEqual(["http://localhost:3000"]);
    expect(runtime.authService.getSession).toBeTypeOf("function");
    expect(runtime.documentService.uploadDocumentFile).toBeTypeOf("function");
    expect(runtime.providerConfigService.listProviderConfigs).toBeTypeOf("function");
    expect(runtime.userService.createUser).toBeTypeOf("function");
    expect(runtime.rateLimiter.consume).toBeTypeOf("function");
    expect(runtime.uploadConfig.maxFileBytes).toBe(8 * 1024 * 1024);
    expect(runtime.uploadConcurrencyLimiter.acquire).toBeTypeOf("function");

    await runtime.close();
  });
});
