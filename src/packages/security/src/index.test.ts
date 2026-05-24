import { describe, expect, it } from "vitest";

import {
  decryptAes256Gcm,
  decryptRsaOaep,
  encryptAes256Gcm,
  encryptRsaOaep,
  generateRsaOaepKeyPair,
  maskSecret,
  normalizeAes256GcmKey,
  secretReferenceSchema,
  sha256Hex,
} from "./index";

describe("@kb/security", () => {
  it("masks secret values without exposing the full input", () => {
    expect(maskSecret("deepseek-api-key")).toBe("[REDACTED]-key");
  });

  it("normalizes secret references", () => {
    expect(secretReferenceSchema.parse({ secretId: "secret_1" })).toEqual({
      secretId: "secret_1",
      version: "v1",
    });
  });

  it("hashes raw identifiers before they enter rate-limit keys", async () => {
    await expect(sha256Hex("admin@example.com")).resolves.toBe(
      "258d8dc916db8cea2cafb6c3cd0cb0246efe061421dbd83ec3a350428cabda4f",
    );
  });

  it("encrypts reversible provider secrets in an AES-256-GCM envelope", async () => {
    const key = normalizeAes256GcmKey(
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    );
    const aad = {
      tenantId: "tenant_1",
      purpose: "provider_api_key",
      secretRecordId: "secret_1",
      keyVersion: "v1",
    };

    const encrypted = await encryptAes256Gcm({
      aad,
      key,
      keyVersion: "v1",
      plaintext: "sk-live-provider-key",
    });

    expect(encrypted.alg).toBe("AES-256-GCM");
    expect(encrypted.keyVersion).toBe("v1");
    expect(encrypted.iv).toHaveLength(16);
    expect(encrypted.tag).toHaveLength(24);
    expect(encrypted.ciphertext).not.toContain("sk-live-provider-key");
    await expect(decryptAes256Gcm({ aad, envelope: encrypted, key })).resolves.toBe(
      "sk-live-provider-key",
    );
  });

  it("generates a fresh IV for every encryption", async () => {
    const key = normalizeAes256GcmKey(
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    );
    const aad = {
      tenantId: "tenant_1",
      purpose: "provider_api_key",
      secretRecordId: "secret_1",
      keyVersion: "v1",
    };

    const first = await encryptAes256Gcm({
      aad,
      key,
      keyVersion: "v1",
      plaintext: "same-secret",
    });
    const second = await encryptAes256Gcm({
      aad,
      key,
      keyVersion: "v1",
      plaintext: "same-secret",
    });

    expect(first.iv).not.toBe(second.iv);
    expect(first.ciphertext).not.toBe(second.ciphertext);
  });

  it("rejects ciphertext when AES-GCM AAD changes", async () => {
    const key = normalizeAes256GcmKey(
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    );
    const aad = {
      tenantId: "tenant_1",
      purpose: "provider_api_key",
      secretRecordId: "secret_1",
      keyVersion: "v1",
    };
    const encrypted = await encryptAes256Gcm({
      aad,
      key,
      keyVersion: "v1",
      plaintext: "sk-live-provider-key",
    });

    await expect(
      decryptAes256Gcm({
        aad: {
          ...aad,
          tenantId: "tenant_2",
        },
        envelope: encrypted,
        key,
      }),
    ).rejects.toThrow("Unable to decrypt secret.");
  });

  it("requires 256-bit AES-GCM keys", () => {
    expect(() => normalizeAes256GcmKey("short")).toThrow(
      "APP_ENCRYPTION_KEY must be a 256-bit key.",
    );
  });

  it("encrypts provider keys for transport with RSA-OAEP public keys", async () => {
    const keyPair = await generateRsaOaepKeyPair({
      expiresAt: "2026-05-23T00:05:00.000Z",
      keyId: "transport_key_1",
    });

    const ciphertext = await encryptRsaOaep({
      plaintext: "sk-live-provider-key",
      publicKey: keyPair.publicKey,
    });

    expect(ciphertext).not.toContain("sk-live-provider-key");
    await expect(
      decryptRsaOaep({
        ciphertext,
        privateKey: keyPair.privateKey,
      }),
    ).resolves.toBe("sk-live-provider-key");
    expect(keyPair.alg).toBe("RSA-OAEP-256");
  });
});
