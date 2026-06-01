import { describe, expect, it } from "vitest";

import { decryptRsaOaep, generateRsaOaepKeyPair } from "@kb/security";

import {
  createEncryptedProviderApiKeyInput,
  createProviderSaveBody,
  providersQueryKey,
} from "../user/provider-hooks";

describe("provider hooks helpers", () => {
  it("uses a stable query key for the fixed provider slots", () => {
    expect(providersQueryKey).toEqual(["providers"]);
  });

  it("encrypts API keys before building save requests", async () => {
    const keyPair = await generateRsaOaepKeyPair({
      expiresAt: "2026-05-23T00:05:00.000Z",
      keyId: "transport_key_1",
    });

    const apiKey = await createEncryptedProviderApiKeyInput({
      apiKey: "sk-browser-provider-key",
      publicKey: {
        alg: "RSA-OAEP-256",
        expiresAt: keyPair.expiresAt,
        keyId: keyPair.keyId,
        publicKey: keyPair.publicKey,
      },
    });

    expect(apiKey).toMatchObject({
      mode: "encrypted",
      keyId: "transport_key_1",
    });
    expect(apiKey.ciphertext).not.toContain("sk-browser-provider-key");
    await expect(
      decryptRsaOaep({
        ciphertext: apiKey.ciphertext,
        privateKey: keyPair.privateKey,
      }),
    ).resolves.toBe("sk-browser-provider-key");
  });

  it("keeps the existing key when the API Key field is blank", () => {
    expect(
      createProviderSaveBody({
        apiKey: "   ",
        baseUrl: "https://api.deepseek.com",
        displayName: "主问答模型服务",
        modelId: "deepseek-chat",
        provider: "deepseek",
        status: "enabled",
      }).apiKey,
    ).toEqual({ mode: "keep" });
  });
});
