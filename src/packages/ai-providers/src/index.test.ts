import { describe, expect, it } from "vitest";

import {
  modelServiceKindOrder,
  providerErrorCodeSchema,
  providerKindSchema,
  providerPublicKeySchema,
  providerSummarySchema,
  saveProviderConfigInputSchema,
} from "./index";

describe("@kb/ai-providers", () => {
  it("defines provider kinds for the initial architecture", () => {
    expect(providerKindSchema.parse("deepseek")).toBe("deepseek");
  });

  it("defines normalized provider error codes", () => {
    expect(providerErrorCodeSchema.parse("PROVIDER_TIMEOUT")).toBe("PROVIDER_TIMEOUT");
  });

  it("keeps the product model service scope fixed to three slots", () => {
    expect(modelServiceKindOrder).toEqual(["chat", "embedding", "rerank"]);
  });

  it("defines redacted provider slot summaries without secret payloads", () => {
    const summary = providerSummarySchema.parse({
      id: "provider_1",
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
    });

    expect(summary).not.toHaveProperty("apiKey");
    expect(summary).not.toHaveProperty("encryptedPayload");
  });

  it("accepts only encrypted or keep-key save requests at the API boundary", () => {
    expect(
      saveProviderConfigInputSchema.parse({
        displayName: "主问答模型服务",
        provider: "deepseek",
        modelId: "deepseek-chat",
        baseUrl: "https://api.deepseek.com",
        status: "enabled",
        apiKey: {
          mode: "encrypted",
          keyId: "transport_key_1",
          ciphertext: "base64-ciphertext",
        },
      }).apiKey.mode,
    ).toBe("encrypted");
    expect(
      saveProviderConfigInputSchema.parse({
        displayName: "主问答模型服务",
        provider: "deepseek",
        modelId: "deepseek-chat",
        baseUrl: "https://api.deepseek.com",
        status: "enabled",
        apiKey: {
          mode: "keep",
        },
      }).apiKey.mode,
    ).toBe("keep");
    expect(() =>
      saveProviderConfigInputSchema.parse({
        displayName: "主问答模型服务",
        provider: "deepseek",
        modelId: "deepseek-chat",
        baseUrl: "https://api.deepseek.com",
        status: "enabled",
        apiKey: "sk-plaintext",
      }),
    ).toThrow();
  });

  it("defines the public key payload used for transport encryption", () => {
    expect(
      providerPublicKeySchema.parse({
        keyId: "transport_key_1",
        publicKey: "spki-base64",
        expiresAt: "2026-05-23T00:05:00.000Z",
        alg: "RSA-OAEP-256",
      }),
    ).toMatchObject({
      alg: "RSA-OAEP-256",
      keyId: "transport_key_1",
    });
  });
});
