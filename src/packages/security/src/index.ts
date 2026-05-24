import { z } from "zod";

export const redactionToken = "[REDACTED]" as const;
export const aes256GcmAlgorithm = "AES-256-GCM" as const;
export const rsaOaepAlgorithm = "RSA-OAEP-256" as const;

export const aes256GcmEnvelopeSchema = z.object({
  alg: z.literal(aes256GcmAlgorithm),
  keyVersion: z.string().min(1),
  iv: z.string().min(1),
  tag: z.string().min(1),
  ciphertext: z.string().min(1),
});

type ByteArray = Uint8Array<ArrayBuffer>;

export type Aes256GcmKey = ByteArray;

export type Aes256GcmAad = Record<string, string>;

export type Aes256GcmEnvelope = z.infer<typeof aes256GcmEnvelopeSchema>;

export interface RsaOaepKeyPair {
  alg: typeof rsaOaepAlgorithm;
  keyId: string;
  publicKey: string;
  privateKey: CryptoKey;
  expiresAt: string;
}

export const secretReferenceSchema = z.object({
  secretId: z.string().min(1),
  version: z.string().min(1).default("v1"),
});

export type SecretReference = z.infer<typeof secretReferenceSchema>;

export function maskSecret(value: string): string {
  if (value.length <= 4) {
    return redactionToken;
  }

  return `${redactionToken}${value.slice(-4)}`;
}

export async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function normalizeAes256GcmKey(value: string): Aes256GcmKey {
  const trimmed = value.trim();
  const bytes = isHexEncodedKey(trimmed)
    ? hexToBytes(trimmed)
    : decodeBase64Key(trimmed) ?? toByteArray(new TextEncoder().encode(trimmed));

  if (bytes.byteLength !== 32) {
    throw new Error("APP_ENCRYPTION_KEY must be a 256-bit key.");
  }

  return bytes;
}

export async function encryptAes256Gcm(input: {
  aad: Aes256GcmAad;
  key: Aes256GcmKey;
  keyVersion: string;
  plaintext: string;
}): Promise<Aes256GcmEnvelope> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cryptoKey = await importAesKey(input.key);
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      {
        additionalData: encodeAad(input.aad),
        iv,
        name: "AES-GCM",
        tagLength: 128,
      },
      cryptoKey,
      toByteArray(new TextEncoder().encode(input.plaintext)),
    ),
  );
  const tagStart = encrypted.byteLength - 16;
  const ciphertext = encrypted.slice(0, tagStart);
  const tag = encrypted.slice(tagStart);

  return {
    alg: aes256GcmAlgorithm,
    keyVersion: input.keyVersion,
    iv: bytesToBase64(iv),
    tag: bytesToBase64(tag),
    ciphertext: bytesToBase64(ciphertext),
  };
}

export async function decryptAes256Gcm(input: {
  aad: Aes256GcmAad;
  envelope: Aes256GcmEnvelope;
  key: Aes256GcmKey;
}): Promise<string> {
  if (input.envelope.alg !== aes256GcmAlgorithm) {
    throw new Error("Unsupported encrypted secret algorithm.");
  }

  try {
    const cryptoKey = await importAesKey(input.key);
    const ciphertext = base64ToBytes(input.envelope.ciphertext);
    const tag = base64ToBytes(input.envelope.tag);
    const encrypted = concatBytes(ciphertext, tag);
    const decrypted = await crypto.subtle.decrypt(
      {
        additionalData: encodeAad(input.aad),
        iv: base64ToBytes(input.envelope.iv),
        name: "AES-GCM",
        tagLength: 128,
      },
      cryptoKey,
      encrypted,
    );

    return new TextDecoder().decode(decrypted);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Unsupported encrypted secret algorithm."
    ) {
      throw error;
    }

    throw new Error("Unable to decrypt secret.");
  }
}

export async function generateRsaOaepKeyPair(input: {
  expiresAt: string;
  keyId: string;
}): Promise<RsaOaepKeyPair> {
  const pair = await crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: toByteArray(new Uint8Array([1, 0, 1])),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"],
  );
  const publicKeyBytes = new Uint8Array(
    await crypto.subtle.exportKey("spki", pair.publicKey),
  );

  return {
    alg: rsaOaepAlgorithm,
    expiresAt: input.expiresAt,
    keyId: input.keyId,
    privateKey: pair.privateKey,
    publicKey: bytesToBase64(publicKeyBytes),
  };
}

export async function encryptRsaOaep(input: {
  plaintext: string;
  publicKey: string;
}): Promise<string> {
  const publicKey = await crypto.subtle.importKey(
    "spki",
    base64ToBytes(input.publicKey),
    {
      name: "RSA-OAEP",
      hash: "SHA-256",
    },
    false,
    ["encrypt"],
  );
  const ciphertext = await crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    publicKey,
    toByteArray(new TextEncoder().encode(input.plaintext)),
  );

  return bytesToBase64(new Uint8Array(ciphertext));
}

export async function decryptRsaOaep(input: {
  ciphertext: string;
  privateKey: CryptoKey;
}): Promise<string> {
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "RSA-OAEP" },
      input.privateKey,
      base64ToBytes(input.ciphertext),
    );

    return new TextDecoder().decode(plaintext);
  } catch {
    throw new Error("Unable to decrypt transport secret.");
  }
}

async function importAesKey(key: Aes256GcmKey): Promise<CryptoKey> {
  if (key.byteLength !== 32) {
    throw new Error("APP_ENCRYPTION_KEY must be a 256-bit key.");
  }

  return crypto.subtle.importKey("raw", key, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

function encodeAad(aad: Aes256GcmAad): ByteArray {
  const canonical = Object.keys(aad)
    .sort()
    .map((key) => `${key}:${aad[key]}`)
    .join("\n");

  return toByteArray(new TextEncoder().encode(canonical));
}

function isHexEncodedKey(value: string): boolean {
  return value.length === 64 && /^[0-9a-f]+$/i.test(value);
}

function hexToBytes(value: string): ByteArray {
  const bytes: ByteArray = new Uint8Array(value.length / 2);

  for (let index = 0; index < value.length; index += 2) {
    bytes[index / 2] = Number.parseInt(value.slice(index, index + 2), 16);
  }

  return bytes;
}

function decodeBase64Key(value: string): ByteArray | null {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) {
    return null;
  }

  try {
    const bytes = base64ToBytes(value);
    return bytes.byteLength === 32 ? bytes : null;
  } catch {
    return null;
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

function base64ToBytes(value: string): ByteArray {
  const binary = atob(value);
  const bytes: ByteArray = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function concatBytes(first: Uint8Array, second: Uint8Array): ByteArray {
  const combined: ByteArray = new Uint8Array(first.byteLength + second.byteLength);
  combined.set(first, 0);
  combined.set(second, first.byteLength);

  return combined;
}

function toByteArray(bytes: Uint8Array): ByteArray {
  const copy: ByteArray = new Uint8Array(bytes.byteLength);
  copy.set(bytes);

  return copy;
}
