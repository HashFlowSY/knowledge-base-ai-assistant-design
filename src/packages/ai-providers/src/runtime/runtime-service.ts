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
} from "../service";
import type { ProviderErrorCode } from "../index";

export type ProviderChatStreamEvent =
  | { type: "delta"; text: string }
  | { type: "done" }
  | { type: "error"; code: ProviderErrorCode };

export interface ProviderChatService {
  generate(input: {
    messages: { role: "system" | "user" | "assistant"; content: string }[];
    requestId: string;
    tenantId: string;
  }): Promise<{ ok: true; text: string } | { ok: false; code: string }>;
  stream(input: {
    messages: { role: "system" | "user" | "assistant"; content: string }[];
    requestId: string;
    signal?: AbortSignal;
    tenantId: string;
  }): AsyncIterable<ProviderChatStreamEvent>;
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

const chatStreamChunkSchema = z.object({
  choices: z.array(
    z.object({
      delta: z
        .object({
          content: z.string().optional(),
        })
        .optional(),
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
    async *stream(input) {
      const resolved = await resolveProviderSecret(options, input.tenantId, "chat");
      if (!resolved.ok) {
        yield { type: "error", code: normalizeProviderCode(resolved.code) };
        return;
      }

      const abort = createProviderAbortSignal({
        parentSignal: input.signal,
        timeoutMs: options.timeoutMs ?? 60_000,
      });

      try {
        const response = await (options.fetcher ?? fetch)(
          createEndpointUrl(resolved.config.baseUrl, "/chat/completions"),
          {
            body: JSON.stringify({
              messages: input.messages,
              model: resolved.config.modelId,
              stream: true,
              temperature: 0.2,
            }),
            headers: {
              accept: "text/event-stream",
              authorization: `Bearer ${resolved.apiKey}`,
              "content-type": "application/json",
              "x-request-id": input.requestId,
            },
            method: "POST",
            signal: abort.signal,
          },
        );
        if (!response.ok) {
          yield {
            type: "error",
            code: normalizeProviderCode(mapProviderStatus(response.status)),
          };
          return;
        }

        if (response.body === null) {
          yield { type: "error", code: "PROVIDER_INVALID_REQUEST" };
          return;
        }

        for await (const event of parseOpenAiChatStream(
          response.body,
          abort.signal,
        )) {
          yield event;
          if (event.type === "done" || event.type === "error") {
            return;
          }
        }
      } catch (error) {
        yield {
          type: "error",
          code: mapProviderStreamError(error, abort.timedOut),
        };
      } finally {
        abort.dispose();
      }
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

async function* parseOpenAiChatStream(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
): AsyncIterable<ProviderChatStreamEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const onAbort = (): void => {
    void reader.cancel();
  };
  signal.addEventListener("abort", onAbort, { once: true });

  try {
    while (true) {
      throwIfAborted(signal);
      const read = await reader.read();
      if (read.done) {
        break;
      }

      buffer += decoder.decode(read.value, { stream: true });
      while (true) {
        const boundary = findSseFrameBoundary(buffer);
        if (boundary === null) {
          break;
        }

        const frame = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary.length);
        const parsed = parseOpenAiChatFrame(frame);
        if (parsed !== null) {
          yield parsed;
          if (parsed.type === "done" || parsed.type === "error") {
            return;
          }
        }
      }
    }

    buffer += decoder.decode();
    if (buffer.trim().length > 0) {
      const parsed = parseOpenAiChatFrame(buffer);
      if (parsed !== null) {
        yield parsed;
        if (parsed.type === "done" || parsed.type === "error") {
          return;
        }
      }
    }

    yield { type: "done" };
  } finally {
    signal.removeEventListener("abort", onAbort);
    reader.releaseLock();
  }
}

function parseOpenAiChatFrame(frame: string): ProviderChatStreamEvent | null {
  const data = frame
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0 && !line.startsWith(":"))
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trimStart())
    .join("\n");

  if (data.length === 0) {
    return null;
  }

  if (data.trim() === "[DONE]") {
    return { type: "done" };
  }

  const parsed = chatStreamChunkSchema.safeParse(JSON.parse(data));
  if (!parsed.success) {
    return { type: "error", code: "PROVIDER_INVALID_REQUEST" };
  }

  const text = parsed.data.choices
    .map((choice) => choice.delta?.content ?? "")
    .join("");
  return text.length > 0 ? { type: "delta", text } : null;
}

function findSseFrameBoundary(buffer: string):
  | {
      index: number;
      length: number;
    }
  | null {
  const lfIndex = buffer.indexOf("\n\n");
  const crlfIndex = buffer.indexOf("\r\n\r\n");
  if (lfIndex === -1 && crlfIndex === -1) {
    return null;
  }
  if (lfIndex !== -1 && (crlfIndex === -1 || lfIndex < crlfIndex)) {
    return { index: lfIndex, length: 2 };
  }

  return { index: crlfIndex, length: 4 };
}

function createProviderAbortSignal(input: {
  parentSignal: AbortSignal | undefined;
  timeoutMs: number;
}): {
  dispose(): void;
  readonly signal: AbortSignal;
  readonly timedOut: boolean;
} {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, input.timeoutMs);
  const onParentAbort = (): void => {
    controller.abort();
  };

  if (input.parentSignal?.aborted) {
    controller.abort();
  } else {
    input.parentSignal?.addEventListener("abort", onParentAbort, { once: true });
  }

  return {
    dispose() {
      clearTimeout(timeout);
      input.parentSignal?.removeEventListener("abort", onParentAbort);
    },
    get signal() {
      return controller.signal;
    },
    get timedOut() {
      return timedOut;
    },
  };
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new ProviderAbortError();
  }
}

function mapProviderStreamError(
  error: unknown,
  timedOut: boolean,
): ProviderErrorCode {
  if (timedOut) {
    return "PROVIDER_TIMEOUT";
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "SyntaxError"
  ) {
    return "PROVIDER_INVALID_REQUEST";
  }

  return "PROVIDER_UNAVAILABLE";
}

function normalizeProviderCode(code: string): ProviderErrorCode {
  const parsedCode = z
    .enum([
      "PROVIDER_AUTH_FAILED",
      "PROVIDER_RATE_LIMITED",
      "PROVIDER_TIMEOUT",
      "PROVIDER_UNAVAILABLE",
      "PROVIDER_INVALID_REQUEST",
      "PROVIDER_UNSUPPORTED_MODEL",
      "PROVIDER_CONTENT_REJECTED",
      "PROVIDER_UNKNOWN_ERROR",
    ])
    .safeParse(code);
  return parsedCode.success ? parsedCode.data : "PROVIDER_UNKNOWN_ERROR";
}

class ProviderAbortError extends Error {
  constructor() {
    super("Provider request aborted.");
    this.name = "AbortError";
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
