import { z } from "zod";

export const redactionToken = "[REDACTED]" as const;

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
