import { describe, expect, it } from "vitest";

import {
  providerListResponseSchema,
  providerPublicKeySchema,
  providerSummarySchema,
} from "@kb/ai-providers";
import { providerUnavailable } from "@kb/errors";
import { encryptRsaOaep } from "@kb/security";
import { apiErrorResponseSchema, apiSuccessResponseSchema } from "@kb/shared";

import { createApiApp, type ProviderConfigApiService } from "../../app";
import { adminSession, createStaticAuthService } from "../../testing/fakes";

describe("provider API router", () => {
  it("protects provider config APIs with admin-only envelopes", async () => {
    const app = createApiApp();
    const response = await app.request("/api/providers", {
      headers: {
        "x-request-id": "req_providers_missing_session",
      },
    });

    expect(response.status).toBe(401);
    expect(apiErrorResponseSchema.parse(await response.json())).toMatchObject({
      code: "UNAUTHORIZED",
      httpStatus: 401,
      requestId: "req_providers_missing_session",
    });
  });

  it("returns fixed redacted provider slots for admin actors", async () => {
    const app = createApiApp({
      authService: createStaticAuthService(adminSession),
      providerConfigService: {
        async listProviderConfigs() {
          return {
            ok: true,
            providers: [
              {
                id: "provider_chat",
                kind: "chat",
                label: "问答模型",
                configured: true,
                displayName: "主问答模型服务",
                provider: "deepseek",
                modelId: "deepseek-chat",
                baseUrl: "https://api.deepseek.com",
                status: "enabled",
                maskedKey: "[REDACTED]-key",
                keyVersion: "v1",
                updatedAt: "2026-05-23T00:00:00.000Z",
              },
              {
                id: null,
                kind: "embedding",
                label: "向量模型",
                configured: false,
                displayName: null,
                provider: null,
                modelId: null,
                baseUrl: null,
                status: null,
                maskedKey: null,
                keyVersion: null,
                updatedAt: null,
              },
              {
                id: null,
                kind: "rerank",
                label: "重排模型",
                configured: false,
                displayName: null,
                provider: null,
                modelId: null,
                baseUrl: null,
                status: null,
                maskedKey: null,
                keyVersion: null,
                updatedAt: null,
              },
            ],
          };
        },
      },
    });

    const response = await app.request("/api/providers", {
      headers: {
        cookie: "better-auth.session_token=token",
        "x-request-id": "req_providers_list",
      },
    });
    const body = apiSuccessResponseSchema(providerListResponseSchema).parse(
      await response.json(),
    );

    expect(response.status).toBe(200);
    expect(body.data.providers.map((provider) => provider.kind)).toEqual([
      "chat",
      "embedding",
      "rerank",
    ]);
    expect(JSON.stringify(body)).not.toContain("encryptedPayload");
    expect(JSON.stringify(body)).not.toContain("sk-");
  });

  it("returns a short-lived provider public key for encrypted API key submission", async () => {
    const app = createApiApp({
      authService: createStaticAuthService(adminSession),
    });

    const response = await app.request("/api/providers/public-key", {
      headers: {
        cookie: "better-auth.session_token=token",
        "x-request-id": "req_provider_public_key",
      },
    });

    expect(response.status).toBe(200);
    expect(
      apiSuccessResponseSchema(providerPublicKeySchema).parse(await response.json()).data,
    ).toMatchObject({
      alg: "RSA-OAEP-256",
    });
  });

  it("decrypts encrypted provider API keys before calling the save service", async () => {
    let receivedApiKey: string | null = null;
    const providerConfigService: Partial<ProviderConfigApiService> = {
      async saveProviderConfig(input) {
        receivedApiKey =
          input.body.apiKey.mode === "plaintext" ? input.body.apiKey.value : null;
        return {
          ok: true,
          provider: providerSummarySchema.parse({
            id: "provider_chat",
            kind: "chat",
            label: "问答模型",
            configured: true,
            displayName: input.body.displayName,
            provider: input.body.provider,
            modelId: input.body.modelId,
            baseUrl: input.body.baseUrl,
            status: input.body.status,
            maskedKey: "[REDACTED]-key",
            keyVersion: "v1",
            updatedAt: "2026-05-23T00:00:00.000Z",
          }),
        };
      },
    };
    const app = createApiApp({
      authService: createStaticAuthService(adminSession),
      providerConfigService,
    });
    const publicKeyResponse = await app.request("/api/providers/public-key", {
      headers: {
        cookie: "better-auth.session_token=token",
        "x-request-id": "req_provider_key_for_save",
      },
    });
    const publicKey = apiSuccessResponseSchema(providerPublicKeySchema).parse(
      await publicKeyResponse.json(),
    ).data;
    const ciphertext = await encryptRsaOaep({
      plaintext: "sk-route-provider-key",
      publicKey: publicKey.publicKey,
    });

    const response = await app.request("/api/providers/chat", {
      method: "PUT",
      body: JSON.stringify({
        displayName: "主问答模型服务",
        provider: "deepseek",
        modelId: "deepseek-chat",
        baseUrl: "https://api.deepseek.com",
        status: "enabled",
        apiKey: {
          mode: "encrypted",
          keyId: publicKey.keyId,
          ciphertext,
        },
      }),
      headers: {
        "content-type": "application/json",
        cookie: "better-auth.session_token=token",
        origin: "http://localhost:3000",
        "x-request-id": "req_provider_save",
      },
    });

    expect(response.status).toBe(200);
    expect(receivedApiKey).toBe("sk-route-provider-key");
    expect(JSON.stringify(await response.json())).not.toContain("sk-route-provider-key");
  });

  it("maps invalid provider transport ciphertext to a validation error", async () => {
    let saveProviderConfigCalled = false;
    const app = createApiApp({
      authService: createStaticAuthService(adminSession),
      providerConfigService: {
        async saveProviderConfig() {
          saveProviderConfigCalled = true;
          throw new Error("provider config service should not run");
        },
      },
    });
    const publicKeyResponse = await app.request("/api/providers/public-key", {
      headers: {
        cookie: "better-auth.session_token=token",
        "x-request-id": "req_provider_key_for_invalid_ciphertext",
      },
    });
    const publicKey = apiSuccessResponseSchema(providerPublicKeySchema).parse(
      await publicKeyResponse.json(),
    ).data;

    const response = await app.request("/api/providers/chat", {
      method: "PUT",
      body: JSON.stringify({
        displayName: "主问答模型服务",
        provider: "deepseek",
        modelId: "deepseek-chat",
        baseUrl: "https://api.deepseek.com",
        status: "enabled",
        apiKey: {
          mode: "encrypted",
          keyId: publicKey.keyId,
          ciphertext: "not-valid-ciphertext token=secret_token",
        },
      }),
      headers: {
        "content-type": "application/json",
        cookie: "better-auth.session_token=token",
        origin: "http://localhost:3000",
        "x-request-id": "req_provider_invalid_ciphertext",
      },
    });
    const body = apiErrorResponseSchema.parse(await response.json());

    expect(response.status).toBe(400);
    expect(body).toMatchObject({
      code: "VALIDATION_ERROR",
      httpStatus: 400,
      message: "密钥传输凭证无效，请重新保存。",
      requestId: "req_provider_invalid_ciphertext",
    });
    expect(saveProviderConfigCalled).toBe(false);
    expect(JSON.stringify(body)).not.toContain("not-valid-ciphertext");
    expect(JSON.stringify(body)).not.toContain("secret_token");
  });

  it("maps provider connection failures to safe API errors", async () => {
    const app = createApiApp({
      authService: createStaticAuthService(adminSession),
      providerConfigService: {
        async saveProviderConfig() {
          throw providerUnavailable({
            domain: "providers",
            reason: "provider_unavailable",
            message: "模型服务暂时不可用，请稍后重试。",
          });
        },
      },
      providerTransportKeyService: {
        async createPublicKey() {
          throw new Error("not used");
        },
        async decryptApiKey() {
          return {
            ok: true,
            plaintext: "sk-route-provider-key",
          };
        },
      },
    });

    const response = await app.request("/api/providers/chat", {
      method: "PUT",
      body: JSON.stringify({
        displayName: "主问答模型服务",
        provider: "deepseek",
        modelId: "deepseek-chat",
        baseUrl: "https://api.deepseek.com",
        status: "enabled",
        apiKey: {
          mode: "encrypted",
          keyId: "transport_key_1",
          ciphertext: "ciphertext",
        },
      }),
      headers: {
        "content-type": "application/json",
        cookie: "better-auth.session_token=token",
        origin: "http://localhost:3000",
        "x-request-id": "req_provider_connection_error",
      },
    });

    expect(response.status).toBe(500);
    expect(apiErrorResponseSchema.parse(await response.json())).toMatchObject({
      code: "PROVIDER_UNAVAILABLE",
      message: "模型服务暂时不可用，请稍后重试。",
      requestId: "req_provider_connection_error",
    });
  });
});
