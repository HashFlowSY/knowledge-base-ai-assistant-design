import { z } from "zod";

export const providerKindSchema = z.enum(["deepseek", "dashscope", "openai-compatible"]);

export type ProviderKind = z.infer<typeof providerKindSchema>;

export const providerOperationSchema = z.enum(["chat", "embedding", "rerank"]);

export type ProviderOperation = z.infer<typeof providerOperationSchema>;

export const providerErrorCodeSchema = z.enum([
  "PROVIDER_AUTH_FAILED",
  "PROVIDER_RATE_LIMITED",
  "PROVIDER_TIMEOUT",
  "PROVIDER_UNAVAILABLE",
  "PROVIDER_INVALID_REQUEST",
  "PROVIDER_UNSUPPORTED_MODEL",
  "PROVIDER_CONTENT_REJECTED",
  "PROVIDER_UNKNOWN_ERROR",
]);

export type ProviderErrorCode = z.infer<typeof providerErrorCodeSchema>;

export const modelServiceKindOrder = ["chat", "embedding", "rerank"] as const;

export const modelServiceKindSchema = z.enum(modelServiceKindOrder);

export type ModelServiceKind = z.infer<typeof modelServiceKindSchema>;

export const providerStatusSchema = z.enum(["enabled", "disabled"]);

export type ProviderStatus = z.infer<typeof providerStatusSchema>;

export const modelServiceKindLabels: Record<ModelServiceKind, string> = {
  chat: "问答模型",
  embedding: "向量模型",
  rerank: "重排模型",
};

export const providerSummarySchema = z.object({
  id: z.string().min(1).nullable(),
  kind: modelServiceKindSchema,
  label: z.string().min(1),
  configured: z.boolean(),
  displayName: z.string().min(1).nullable(),
  provider: z.string().min(1).nullable(),
  modelId: z.string().min(1).nullable(),
  baseUrl: z.string().url().nullable(),
  status: providerStatusSchema.nullable(),
  maskedKey: z.string().min(1).nullable(),
  keyVersion: z.string().min(1).nullable(),
  updatedAt: z.string().datetime().nullable(),
});

export type ProviderSummary = z.infer<typeof providerSummarySchema>;

export const providerListResponseSchema = z.object({
  providers: z.array(providerSummarySchema).length(modelServiceKindOrder.length),
});

export type ProviderListResponse = z.infer<typeof providerListResponseSchema>;

export const providerPublicKeySchema = z.object({
  keyId: z.string().min(1),
  publicKey: z.string().min(1),
  expiresAt: z.string().datetime(),
  alg: z.literal("RSA-OAEP-256"),
});

export type ProviderPublicKey = z.infer<typeof providerPublicKeySchema>;

export const providerApiKeyInputSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("keep"),
  }),
  z.object({
    mode: z.literal("encrypted"),
    keyId: z.string().min(1),
    ciphertext: z.string().min(1),
  }),
]);

export type ProviderApiKeyInput = z.infer<typeof providerApiKeyInputSchema>;

export const saveProviderConfigInputSchema = z.object({
  displayName: z.string().trim().min(1).max(200),
  provider: z.string().trim().min(1).max(120),
  modelId: z.string().trim().min(1).max(200),
  baseUrl: z
    .string()
    .trim()
    .url()
    .refine((value) => {
      const url = new URL(value);
      return url.protocol === "https:" || url.protocol === "http:";
    }, "Base URL must use http or https."),
  status: providerStatusSchema,
  apiKey: providerApiKeyInputSchema,
});

export type SaveProviderConfigInput = z.infer<typeof saveProviderConfigInputSchema>;
