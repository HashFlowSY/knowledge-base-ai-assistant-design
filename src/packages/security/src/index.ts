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
