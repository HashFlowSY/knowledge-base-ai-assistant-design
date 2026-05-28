import { normalizeAes256GcmKey } from "@kb/security";

import type {
  EmbeddingFetch,
  ProviderConnectionTestInput,
} from "../service";

export const actor = {
  user: { id: "admin_1", name: "管理员", email: "admin@example.com" },
  tenant: { id: "tenant_1" },
  role: "admin" as const,
};

export const encryptionKey = normalizeAes256GcmKey(
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
);

export function saveBody(input: {
  apiKey: { mode: "keep" } | { mode: "plaintext"; value: string };
  modelId?: string;
}) {
  return {
    displayName: "主模型服务",
    provider: "deepseek",
    modelId: input.modelId ?? "deepseek-chat",
    baseUrl: "https://api.deepseek.com",
    status: "enabled" as const,
    apiKey: input.apiKey,
  };
}

export function embeddingSaveBody(input: {
  apiKey: { mode: "keep" } | { mode: "plaintext"; value: string };
  status?: "enabled" | "disabled";
}) {
  return {
    displayName: "向量模型",
    provider: "openai-compatible",
    modelId: "text-embedding-v4",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    status: input.status ?? "enabled",
    apiKey: input.apiKey,
  };
}

export function createEmbeddingFetch(input: {
  calls?: { url: string; init: RequestInit }[];
  responseBody: Record<string, unknown>;
}): EmbeddingFetch {
  return async (url, init) => {
    input.calls?.push({ url: String(url), init });
    return new Response(JSON.stringify(input.responseBody), {
      status: 200,
      headers: {
        "content-type": "application/json",
      },
    });
  };
}

export function createVector(value: number): number[] {
  return Array.from({ length: 1_024 }, () => value);
}

export function alwaysPassConnectionTester(): (
  input: ProviderConnectionTestInput,
) => Promise<{
  ok: true;
}> {
  return async () => ({ ok: true });
}

export function connectionInput(
  input: Partial<ProviderConnectionTestInput>,
): ProviderConnectionTestInput {
  return {
    apiKey: "sk-live-provider-key",
    baseUrl: "https://api.deepseek.com",
    kind: "chat",
    modelId: "deepseek-chat",
    provider: "deepseek",
    requestId: "req_connection_test",
    tenantId: "tenant_1",
    ...input,
  };
}
