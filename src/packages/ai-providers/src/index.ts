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
