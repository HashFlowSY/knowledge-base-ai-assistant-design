import { z } from "zod";

import {
  aes256GcmEnvelopeSchema,
  decryptAes256Gcm,
  type Aes256GcmKey,
} from "@kb/security";

import type {
  ProviderConfigRecord,
  ProviderConfigRepository,
  ProviderSecretRecord,
} from "./service";

export interface ProviderChatService {
  generate(input: {
    messages: { role: "system" | "user" | "assistant"; content: string }[];
    requestId: string;
    tenantId: string;
  }): Promise<{ ok: true; text: string } | { ok: false; code: string }>;
}

export interface ProviderRerankService {
  rerank(input: {
    documents: { id: string; text: string }[];
    query: string;
    requestId: string;
    tenantId: string;
  }): Promise<
    | { ok: true; results: { id: string; score: number }[] }
    | { ok: false; code: string }
  >;
}

export interface ProviderRuntimeOptions {
  encryptionKey: Aes256GcmKey;
  fetcher?: typeof fetch;
  repository: ProviderConfigRepository;
  timeoutMs?: number;
}

const chatResponseSchema = z.object({
  choices: z.array(
    z.object({
      message: z.object({
        content: z.string(),
      }),
    }),
  ),
});

const rerankResponseSchema = z.object({
  results: z.array(
    z.object({
      index: z.number().int().min(0).optional(),
      relevance_score: z.number().optional(),
      score: z.number().optional(),
    }),
  ),
});

export function createProviderChatService(
  options: ProviderRuntimeOptions,
): ProviderChatService {
  return {
    async generate(input) {
      const resolved = await resolveProviderSecret(options, input.tenantId, "chat");
      if (!resolved.ok) {
        return resolved;
      }

      return withTimeout(options.timeoutMs ?? 60_000, async (signal) => {
        const response = await (options.fetcher ?? fetch)(
          createEndpointUrl(resolved.config.baseUrl, "/chat/completions"),
          {
            body: JSON.stringify({
              messages: input.messages,
              model: resolved.config.modelId,
              stream: false,
              temperature: 0.2,
            }),
            headers: {
              accept: "application/json",
              authorization: `Bearer ${resolved.apiKey}`,
              "content-type": "application/json",
              "x-request-id": input.requestId,
            },
            method: "POST",
            signal,
          },
        );
        if (!response.ok) {
          return { ok: false, code: mapProviderStatus(response.status) };
        }

        const parsed = chatResponseSchema.safeParse(await response.json());
        const text = parsed.success ? parsed.data.choices[0]?.message.content : null;
        return text === null || text === undefined
          ? { ok: false, code: "PROVIDER_INVALID_REQUEST" }
          : { ok: true, text };
      });
    },
  };
}

export function createProviderRerankService(
  options: ProviderRuntimeOptions,
): ProviderRerankService {
  return {
    async rerank(input) {
      const resolved = await resolveProviderSecret(options, input.tenantId, "rerank");
      if (!resolved.ok) {
        return resolved;
      }

      return withTimeout(options.timeoutMs ?? 30_000, async (signal) => {
        const response = await (options.fetcher ?? fetch)(
          createEndpointUrl(resolved.config.baseUrl, "/reranks"),
          {
            body: JSON.stringify({
              documents: input.documents.map((document) => document.text),
              model: resolved.config.modelId,
              query: input.query,
              top_n: input.documents.length,
            }),
            headers: {
              accept: "application/json",
              authorization: `Bearer ${resolved.apiKey}`,
              "content-type": "application/json",
              "x-request-id": input.requestId,
            },
            method: "POST",
            signal,
          },
        );
        if (!response.ok) {
          return { ok: false, code: mapProviderStatus(response.status) };
        }

        const parsed = rerankResponseSchema.safeParse(await response.json());
        if (!parsed.success) {
          return { ok: false, code: "PROVIDER_INVALID_REQUEST" };
        }

        return {
          ok: true,
          results: parsed.data.results.map((result, index) => {
            const documentIndex = result.index ?? index;
            return {
              id: input.documents[documentIndex]?.id ?? input.documents[index]?.id ?? "",
              score: result.score ?? result.relevance_score ?? 0,
            };
          }),
        };
      });
    },
  };
}

async function resolveProviderSecret(
  options: ProviderRuntimeOptions,
  tenantId: string,
  kind: "chat" | "rerank",
): Promise<
  | { ok: true; apiKey: string; config: ProviderConfigRecord }
  | { ok: false; code: string }
> {
  const config = await options.repository.getProviderConfig({ kind, tenantId });
  if (config === null || config.status !== "enabled" || config.secretRecordId === null) {
    return { ok: false, code: "PROVIDER_UNAVAILABLE" };
  }

  const secret = await options.repository.getSecret({
    secretRecordId: config.secretRecordId,
    tenantId,
  });
  if (secret === null) {
    return { ok: false, code: "PROVIDER_UNAVAILABLE" };
  }

  return {
    ok: true,
    apiKey: await decryptProviderApiKey(options.encryptionKey, secret),
    config,
  };
}

async function decryptProviderApiKey(
  encryptionKey: Aes256GcmKey,
  secret: ProviderSecretRecord,
): Promise<string> {
  const envelope = aes256GcmEnvelopeSchema.parse(JSON.parse(secret.encryptedPayload));
  return decryptAes256Gcm({
    aad: {
      keyVersion: secret.keyVersion,
      purpose: "provider_api_key",
      secretRecordId: secret.id,
      tenantId: secret.tenantId,
    },
    envelope,
    key: encryptionKey,
  });
}

async function withTimeout<T>(
  timeoutMs: number,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T | { ok: false; code: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await run(controller.signal);
  } catch (error) {
    return {
      ok: false,
      code:
        typeof error === "object" &&
        error !== null &&
        "name" in error &&
        error.name === "AbortError"
          ? "PROVIDER_TIMEOUT"
          : "PROVIDER_UNAVAILABLE",
    };
  } finally {
    clearTimeout(timeout);
  }
}

function createEndpointUrl(baseUrl: string, endpointPath: string): string {
  const url = new URL(baseUrl);
  const normalizedEndpointPath = `/${endpointPath.replace(/^\/+/, "")}`;
  const basePath = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";

  if (basePath === normalizedEndpointPath || basePath.endsWith(normalizedEndpointPath)) {
    return url.toString();
  }

  url.pathname = `${basePath}/${normalizedEndpointPath.slice(1)}`;
  return url.toString();
}

function mapProviderStatus(status: number): string {
  if (status === 401 || status === 403) {
    return "PROVIDER_AUTH_FAILED";
  }
  if (status === 408) {
    return "PROVIDER_TIMEOUT";
  }
  if (status === 429) {
    return "PROVIDER_RATE_LIMITED";
  }
  if (status >= 500) {
    return "PROVIDER_UNAVAILABLE";
  }

  return "PROVIDER_INVALID_REQUEST";
}
