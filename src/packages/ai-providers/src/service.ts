import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { providerConfigs, secretRecords, type ProjectDb } from "@kb/db";
import {
  aes256GcmEnvelopeSchema,
  decryptAes256Gcm,
  encryptAes256Gcm,
  maskSecret,
  type Aes256GcmKey,
} from "@kb/security";

import {
  modelServiceKindLabels,
  modelServiceKindOrder,
  type ModelServiceKind,
  type ProviderErrorCode,
  type ProviderStatus,
  type ProviderSummary,
} from "./index";

const providerSecretPurpose = "provider_api_key" as const;
const dashScopeNativeEmbeddingPath =
  "/api/v1/services/embeddings/text-embedding/text-embedding";
const dashScopeNativeRerankPath =
  "/api/v1/services/rerank/text-rerank/text-rerank";
const dashScopeCompatibleRerankPath = "/compatible-api/v1/reranks";

export interface ProviderConfigActor {
  user: {
    id: string;
  };
  tenant: {
    id: string;
  };
  role: "admin" | "member";
}

export interface ProviderConfigRecord {
  id: string;
  tenantId: string;
  kind: ModelServiceKind;
  displayName: string;
  provider: string;
  modelId: string;
  baseUrl: string;
  status: ProviderStatus;
  secretRecordId: string | null;
  maskedKey: string | null;
  keyVersion: string | null;
  updatedAt: Date;
}

export interface ProviderSecretRecord {
  id: string;
  tenantId: string;
  encryptedPayload: string;
  keyVersion: string;
  metadata: Record<string, unknown>;
}

export interface ProviderSecretCreateInput {
  id: string;
  tenantId: string;
  encryptedPayload: string;
  keyVersion: string;
  metadata: Record<string, unknown>;
  createdByUserId: string;
}

export interface ProviderConfigSaveInput {
  tenantId: string;
  kind: ModelServiceKind;
  displayName: string;
  provider: string;
  modelId: string;
  baseUrl: string;
  status: ProviderStatus;
  secret: ProviderSecretCreateInput | null;
  actorId: string;
}

export interface ProviderConfigRepository {
  listProviderConfigs(input: { tenantId: string }): Promise<ProviderConfigRecord[]>;
  getProviderConfig(input: {
    kind: ModelServiceKind;
    tenantId: string;
  }): Promise<ProviderConfigRecord | null>;
  getSecret(input: {
    secretRecordId: string;
    tenantId: string;
  }): Promise<ProviderSecretRecord | null>;
  saveProviderConfig(input: ProviderConfigSaveInput): Promise<{
    config: ProviderConfigRecord;
    created: boolean;
  }>;
}

export interface ProviderConnectionTestInput {
  apiKey: string;
  baseUrl: string;
  kind: ModelServiceKind;
  modelId: string;
  provider: string;
  requestId: string;
  tenantId: string;
}

export type ProviderConnectionTestResult =
  | { ok: true }
  | {
      ok: false;
      code: ProviderErrorCode;
      message: string;
    };

type ProviderConnectionFetch = (input: string, init: RequestInit) => Promise<Response>;

interface ProviderConnectionRequest {
  url: string;
  method: "GET" | "POST";
  body?: Record<string, unknown>;
}

export interface ProviderConnectionTesterOptions {
  fetcher?: ProviderConnectionFetch;
  timeoutMs?: number;
}

export interface ProviderAuditEventInput {
  tenantId: string;
  actorId: string;
  action:
    | "provider_config.created"
    | "provider_config.updated"
    | "provider_config.disabled"
    | "provider_config.key_rotated"
    | "provider_config.connection_tested";
  targetId: string;
  requestId: string;
  ipSummary: string | null;
  userAgentSummary: string | null;
  metadata: Record<string, unknown>;
}

export interface ProviderConfigServiceOptions {
  connectionTester: (
    input: ProviderConnectionTestInput,
  ) => Promise<ProviderConnectionTestResult>;
  encryptionKey: Aes256GcmKey;
  repository: ProviderConfigRepository;
  auditRecorder?: (input: ProviderAuditEventInput) => Promise<void>;
}

export interface ProviderConfigServiceError {
  ok: false;
  code:
    | "VALIDATION_ERROR"
    | "FORBIDDEN"
    | "RATE_LIMITED"
    | "PROVIDER_UNAVAILABLE"
    | "INTERNAL_ERROR";
  httpStatus: 400 | 403 | 429 | 500;
  message: string;
}

export interface ProviderConfigService {
  listProviderConfigs(input: {
    actor: ProviderConfigActor;
  }): Promise<{ ok: true; providers: ProviderSummary[] } | ProviderConfigServiceError>;
  saveProviderConfig(input: {
    actor: ProviderConfigActor;
    body: ProviderConfigServiceSaveBody;
    ipSummary?: string | null;
    kind: ModelServiceKind;
    requestId: string;
    userAgentSummary?: string | null;
  }): Promise<{ ok: true; provider: ProviderSummary } | ProviderConfigServiceError>;
}

export type EmbeddingFetch = (input: string, init: RequestInit) => Promise<Response>;

export type EmbeddingErrorCode =
  | "EMBEDDING_PROVIDER_NOT_CONFIGURED"
  | ProviderErrorCode;

export interface EmbeddingUsage {
  totalTokens?: number;
}

export type EmbeddingServiceResult =
  | {
      ok: true;
      providerConfigId: string;
      provider: string;
      modelId: string;
      dimensions: number;
      vectors: number[][];
      usage?: EmbeddingUsage;
      providerRequestId?: string;
    }
  | {
      ok: false;
      code: EmbeddingErrorCode;
      message: string;
      retryable: boolean;
    };

export interface EmbeddingService {
  embed(input: {
    tenantId: string;
    inputs: string[];
    requestId: string;
  }): Promise<EmbeddingServiceResult>;
}

export interface EmbeddingServiceOptions {
  encryptionKey: Aes256GcmKey;
  repository: ProviderConfigRepository;
  fetcher?: EmbeddingFetch;
  timeoutMs?: number;
}

export interface ProviderConfigServiceSaveBody {
  displayName: string;
  provider: string;
  modelId: string;
  baseUrl: string;
  status: ProviderStatus;
  apiKey: { mode: "keep" } | { mode: "plaintext"; value: string };
}

export function createProviderConfigService(
  options: ProviderConfigServiceOptions,
): ProviderConfigService {
  return {
    async listProviderConfigs(input) {
      const configs = await options.repository.listProviderConfigs({
        tenantId: input.actor.tenant.id,
      });

      return {
        ok: true,
        providers: summarizeConfigs(configs),
      };
    },
    async saveProviderConfig(input) {
      const existingConfig = await options.repository.getProviderConfig({
        kind: input.kind,
        tenantId: input.actor.tenant.id,
      });
      const keyResult = await resolveCandidateApiKey({
        actor: input.actor,
        body: input.body,
        encryptionKey: options.encryptionKey,
        existingConfig,
        repository: options.repository,
      });
      if (!keyResult.ok) {
        return keyResult;
      }

      const connectionResult = await options.connectionTester({
        apiKey: keyResult.apiKey,
        baseUrl: input.body.baseUrl,
        kind: input.kind,
        modelId: input.body.modelId,
        provider: input.body.provider,
        requestId: input.requestId,
        tenantId: input.actor.tenant.id,
      });
      const safeConnectionMetadata = {
        kind: input.kind,
        provider: input.body.provider,
        modelId: input.body.modelId,
        status: input.body.status,
        ok: connectionResult.ok,
      };
      await recordAudit(options, {
        action: "provider_config.connection_tested",
        actorId: input.actor.user.id,
        metadata: safeConnectionMetadata,
        requestId: input.requestId,
        ipSummary: input.ipSummary ?? null,
        targetId: existingConfig?.id ?? input.kind,
        tenantId: input.actor.tenant.id,
        userAgentSummary: input.userAgentSummary ?? null,
      });
      if (!connectionResult.ok) {
        return mapProviderConnectionError(connectionResult.code);
      }

      const shouldRotateSecret =
        keyResult.source === "new" &&
        (keyResult.existingPlaintext === null ||
          keyResult.existingPlaintext !== keyResult.apiKey);
      const nextSecret =
        shouldRotateSecret || existingConfig === null
          ? await createEncryptedSecret({
              actorId: input.actor.user.id,
              apiKey: keyResult.apiKey,
              encryptionKey: options.encryptionKey,
              existingConfig,
              tenantId: input.actor.tenant.id,
            })
          : null;
      const saved = await options.repository.saveProviderConfig({
        actorId: input.actor.user.id,
        baseUrl: input.body.baseUrl,
        displayName: input.body.displayName,
        kind: input.kind,
        modelId: input.body.modelId,
        provider: input.body.provider,
        secret: nextSecret,
        status: input.body.status,
        tenantId: input.actor.tenant.id,
      });
      const summary = summarizeConfig(saved.config);
      const mutationAction = getMutationAuditAction({
        created: saved.created,
        keyRotated: nextSecret !== null && existingConfig !== null,
        status: input.body.status,
      });
      await recordAudit(options, {
        action: mutationAction,
        actorId: input.actor.user.id,
        metadata: {
          kind: input.kind,
          provider: input.body.provider,
          modelId: input.body.modelId,
          status: input.body.status,
          keyRotated: nextSecret !== null && existingConfig !== null,
        },
        requestId: input.requestId,
        ipSummary: input.ipSummary ?? null,
        targetId: saved.config.id,
        tenantId: input.actor.tenant.id,
        userAgentSummary: input.userAgentSummary ?? null,
      });

      return {
        ok: true,
        provider: summary,
      };
    },
  };
}

export function createEmbeddingService(
  options: EmbeddingServiceOptions,
): EmbeddingService {
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? 30_000;

  return {
    async embed(input): Promise<EmbeddingServiceResult> {
      const config = await options.repository.getProviderConfig({
        kind: "embedding",
        tenantId: input.tenantId,
      });
      if (
        config === null ||
        config.status !== "enabled" ||
        config.secretRecordId === null
      ) {
        return createEmbeddingProviderNotConfiguredResult();
      }

      const apiKeyResult = await decryptExistingApiKey({
        actor: {
          role: "admin",
          tenant: { id: input.tenantId },
          user: { id: "system" },
        },
        encryptionKey: options.encryptionKey,
        existingConfig: config,
        repository: options.repository,
      });
      if (!apiKeyResult.ok || apiKeyResult.apiKey === null) {
        return {
          ok: false,
          code: "PROVIDER_UNKNOWN_ERROR",
          message: "向量模型密钥不可用。",
          retryable: false,
        };
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const request = createEmbeddingRequest({
          apiKey: apiKeyResult.apiKey,
          baseUrl: config.baseUrl,
          inputs: input.inputs,
          modelId: config.modelId,
          provider: config.provider,
        });
        const response = await fetcher(request.url, {
          body: JSON.stringify(request.body),
          headers: {
            accept: "application/json",
            authorization: `Bearer ${apiKeyResult.apiKey}`,
            "content-type": "application/json",
            "x-request-id": input.requestId,
          },
          method: "POST",
          signal: controller.signal,
        });
        if (!response.ok) {
          return mapEmbeddingProviderError(
            normalizeProviderConnectionResponse(response.status),
          );
        }

        const parsed = parseEmbeddingResponse(await response.json(), input.inputs.length);
        if (!parsed.ok) {
          return parsed;
        }

        const providerRequestId = response.headers.get("x-request-id");

        return {
          ok: true,
          dimensions: parsed.vectors[0]?.length ?? 0,
          modelId: config.modelId,
          provider: config.provider,
          providerConfigId: config.id,
          vectors: parsed.vectors,
          ...(parsed.usage === undefined ? {} : { usage: parsed.usage }),
          ...(providerRequestId === null ? {} : { providerRequestId }),
        };
      } catch (error) {
        if (isAbortError(error)) {
          return {
            ok: false,
            code: "PROVIDER_TIMEOUT",
            message: "向量模型调用超时。",
            retryable: true,
          };
        }

        return {
          ok: false,
          code: "PROVIDER_UNAVAILABLE",
          message: "向量模型暂时不可用。",
          retryable: true,
        };
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

export function createProviderConnectionTester(
  options: ProviderConnectionTesterOptions = {},
): (input: ProviderConnectionTestInput) => Promise<ProviderConnectionTestResult> {
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? 10_000;

  return async (input) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const request = createProviderConnectionRequest(input);
      const headers: Record<string, string> = {
        accept: "application/json",
        authorization: `Bearer ${input.apiKey}`,
      };
      const requestInit: RequestInit = {
        headers,
        method: request.method,
        signal: controller.signal,
      };
      if (request.body !== undefined) {
        headers["content-type"] = "application/json";
        requestInit.body = JSON.stringify(request.body);
      }

      const response = await fetcher(request.url, requestInit);
      return normalizeProviderConnectionResponse(response.status);
    } catch (error) {
      if (isAbortError(error)) {
        return {
          ok: false,
          code: "PROVIDER_TIMEOUT",
          message: "模型服务连接超时。",
        };
      }

      return {
        ok: false,
        code: "PROVIDER_UNAVAILABLE",
        message: "模型服务暂时不可用。",
      };
    } finally {
      clearTimeout(timeout);
    }
  };
}

function createProviderConnectionRequest(
  input: ProviderConnectionTestInput,
): ProviderConnectionRequest {
  if (input.kind === "chat" && isDeepSeekProvider(input)) {
    return {
      method: "GET",
      url: createEndpointUrl(input.baseUrl, "/models"),
    };
  }

  if (input.kind === "chat") {
    return {
      body: {
        max_tokens: 1,
        messages: [{ role: "user", content: "ping" }],
        model: input.modelId,
        stream: false,
      },
      method: "POST",
      url: createEndpointUrl(input.baseUrl, "/chat/completions"),
    };
  }

  if (input.kind === "embedding") {
    if (isDashScopeProvider(input) && isDashScopeNativeBaseUrl(input.baseUrl)) {
      return {
        body: {
          model: input.modelId,
          input: {
            texts: ["ping"],
          },
          parameters: {
            dimension: 1024,
            output_type: "dense",
          },
        },
        method: "POST",
        url: createDashScopeEndpointUrl(input.baseUrl, dashScopeNativeEmbeddingPath),
      };
    }

    return {
      body: {
        dimensions: 1024,
        encoding_format: "float",
        input: "ping",
        model: input.modelId,
      },
      method: "POST",
      url: createEndpointUrl(input.baseUrl, "/embeddings"),
    };
  }

  if (isDashScopeProvider(input) && isDashScopeNativeRerankModel(input.modelId)) {
    return {
      body: {
        model: input.modelId,
        input: {
          query: "ping",
          documents: ["ping", "pong"],
        },
        parameters: {
          top_n: 1,
        },
      },
      method: "POST",
      url: createDashScopeEndpointUrl(input.baseUrl, dashScopeNativeRerankPath),
    };
  }

  return {
    body: {
      documents: ["ping", "pong"],
      model: input.modelId,
      query: "ping",
      top_n: 1,
    },
    method: "POST",
    url: createEndpointUrl(getRerankBaseUrl(input), "/reranks"),
  };
}

interface EmbeddingRequest {
  url: string;
  body: Record<string, unknown>;
}

const embeddingVectorSchema = z.array(z.number()).length(1024);
const openAiEmbeddingResponseSchema = z.object({
  data: z.array(
    z.object({
      embedding: embeddingVectorSchema,
      index: z.number().int().min(0).optional(),
    }),
  ),
  usage: z
    .object({
      total_tokens: z.number().int().nonnegative().optional(),
    })
    .optional(),
});
const dashScopeEmbeddingResponseSchema = z.object({
  output: z.object({
    embeddings: z.array(
      z.object({
        embedding: embeddingVectorSchema,
        text_index: z.number().int().min(0).optional(),
      }),
    ),
  }),
  usage: z
    .object({
      total_tokens: z.number().int().nonnegative().optional(),
    })
    .optional(),
});

function createEmbeddingRequest(input: {
  apiKey: string;
  baseUrl: string;
  inputs: string[];
  modelId: string;
  provider: string;
}): EmbeddingRequest {
  if (
    isDashScopeProvider({
      apiKey: input.apiKey,
      baseUrl: input.baseUrl,
      kind: "embedding",
      modelId: input.modelId,
      provider: input.provider,
      requestId: "embedding",
      tenantId: "tenant",
    }) &&
    isDashScopeNativeBaseUrl(input.baseUrl)
  ) {
    return {
      body: {
        model: input.modelId,
        input: {
          texts: input.inputs,
        },
        parameters: {
          dimension: 1024,
          output_type: "dense",
        },
      },
      url: createDashScopeEndpointUrl(input.baseUrl, dashScopeNativeEmbeddingPath),
    };
  }

  return {
    body: {
      dimensions: 1024,
      encoding_format: "float",
      input: input.inputs,
      model: input.modelId,
    },
    url: createEndpointUrl(input.baseUrl, "/embeddings"),
  };
}

function parseEmbeddingResponse(
  value: unknown,
  expectedCount: number,
):
  | { ok: true; vectors: number[][]; usage?: EmbeddingUsage }
  | Extract<EmbeddingServiceResult, { ok: false }> {
  const openAiResponse = openAiEmbeddingResponseSchema.safeParse(value);
  if (openAiResponse.success) {
    const vectors = [...openAiResponse.data.data]
      .sort((left, right) => (left.index ?? 0) - (right.index ?? 0))
      .map((item) => item.embedding);
    const usage = normalizeEmbeddingUsage(openAiResponse.data.usage?.total_tokens);
    return validateEmbeddingVectors({
      expectedCount,
      ...(usage === undefined ? {} : { usage }),
      vectors,
    });
  }

  const dashScopeResponse = dashScopeEmbeddingResponseSchema.safeParse(value);
  if (dashScopeResponse.success) {
    const vectors = [...dashScopeResponse.data.output.embeddings]
      .sort((left, right) => (left.text_index ?? 0) - (right.text_index ?? 0))
      .map((item) => item.embedding);
    const usage = normalizeEmbeddingUsage(
      dashScopeResponse.data.usage?.total_tokens,
    );
    return validateEmbeddingVectors({
      expectedCount,
      ...(usage === undefined ? {} : { usage }),
      vectors,
    });
  }

  return {
    ok: false,
    code: "PROVIDER_INVALID_REQUEST",
    message: "向量模型返回格式无效。",
    retryable: false,
  };
}

function validateEmbeddingVectors(input: {
  expectedCount: number;
  vectors: number[][];
  usage?: EmbeddingUsage;
}):
  | { ok: true; vectors: number[][]; usage?: EmbeddingUsage }
  | Extract<EmbeddingServiceResult, { ok: false }> {
  if (input.vectors.length !== input.expectedCount) {
    return {
      ok: false,
      code: "PROVIDER_INVALID_REQUEST",
      message: "向量模型返回数量与输入不一致。",
      retryable: false,
    };
  }

  return {
    ok: true,
    vectors: input.vectors,
    ...(input.usage === undefined ? {} : { usage: input.usage }),
  };
}

function normalizeEmbeddingUsage(totalTokens: number | undefined):
  | EmbeddingUsage
  | undefined {
  return totalTokens === undefined ? undefined : { totalTokens };
}

function createEmbeddingProviderNotConfiguredResult(): Extract<
  EmbeddingServiceResult,
  { ok: false }
> {
  return {
    ok: false,
    code: "EMBEDDING_PROVIDER_NOT_CONFIGURED",
    message: "未配置可用的向量模型服务。",
    retryable: true,
  };
}

function mapEmbeddingProviderError(
  result: ProviderConnectionTestResult,
): Extract<EmbeddingServiceResult, { ok: false }> {
  if (result.ok) {
    return {
      ok: false,
      code: "PROVIDER_UNKNOWN_ERROR",
      message: "向量模型调用失败。",
      retryable: true,
    };
  }

  return {
    ok: false,
    code: result.code,
    message: result.message,
    retryable:
      result.code === "PROVIDER_RATE_LIMITED" ||
      result.code === "PROVIDER_TIMEOUT" ||
      result.code === "PROVIDER_UNAVAILABLE" ||
      result.code === "PROVIDER_UNKNOWN_ERROR",
  };
}

function normalizeProviderConnectionResponse(
  status: number,
): ProviderConnectionTestResult {
  if (status >= 200 && status < 300) {
    return { ok: true };
  }

  if (status === 401 || status === 403) {
    return {
      ok: false,
      code: "PROVIDER_AUTH_FAILED",
      message: "模型服务认证失败。",
    };
  }

  if (status === 429) {
    return {
      ok: false,
      code: "PROVIDER_RATE_LIMITED",
      message: "模型服务请求过于频繁。",
    };
  }

  if (status === 408) {
    return {
      ok: false,
      code: "PROVIDER_TIMEOUT",
      message: "模型服务连接超时。",
    };
  }

  if (status >= 500) {
    return {
      ok: false,
      code: "PROVIDER_UNAVAILABLE",
      message: "模型服务暂时不可用。",
    };
  }

  return {
    ok: false,
    code: "PROVIDER_INVALID_REQUEST",
    message: "模型服务连接测试失败。",
  };
}

function createEndpointUrl(baseUrl: string, endpointPath: string): string {
  const url = new URL(baseUrl);
  const normalizedEndpointPath = normalizeEndpointPath(endpointPath);
  const basePath = url.pathname.replace(/\/+$/, "");

  url.search = "";
  url.hash = "";
  if (basePath === normalizedEndpointPath || basePath.endsWith(normalizedEndpointPath)) {
    return url.toString();
  }

  url.pathname = `${basePath}/${normalizedEndpointPath.slice(1)}`;
  return url.toString();
}

function createDashScopeEndpointUrl(baseUrl: string, endpointPath: string): string {
  const url = new URL(baseUrl);
  const normalizedEndpointPath = normalizeEndpointPath(endpointPath);
  const basePath = url.pathname.replace(/\/+$/, "");

  url.search = "";
  url.hash = "";
  if (
    basePath === normalizedEndpointPath ||
    basePath.endsWith(normalizedEndpointPath)
  ) {
    return url.toString();
  }

  url.pathname = normalizedEndpointPath;
  return url.toString();
}

function normalizeEndpointPath(endpointPath: string): string {
  return `/${endpointPath.replace(/^\/+/, "").replace(/\/+$/, "")}`;
}

function getRerankBaseUrl(input: ProviderConnectionTestInput): string {
  if (!isDashScopeProvider(input)) {
    return input.baseUrl;
  }

  const url = new URL(input.baseUrl);
  url.pathname = getDashScopeCompatibleApiPath(url.pathname);

  return url.toString();
}

function getDashScopeCompatibleApiPath(pathname: string): string {
  const path = pathname.replace(/\/+$/, "");

  if (path === "/compatible-api/v1" || path.endsWith(dashScopeCompatibleRerankPath)) {
    return path;
  }

  if (path.includes("/compatible-mode/v1") || path.includes("/api/v1")) {
    return path
      .replace("/compatible-mode/v1", "/compatible-api/v1")
      .replace("/api/v1", "/compatible-api/v1");
  }

  return "/compatible-api/v1";
}

function isDashScopeNativeBaseUrl(baseUrl: string): boolean {
  const path = new URL(baseUrl).pathname.replace(/\/+$/, "");

  return path === "/api/v1" || path.includes("/api/v1/services/");
}

function isDashScopeNativeRerankModel(modelId: string): boolean {
  const model = modelId.toLowerCase();

  return model.includes("gte-rerank") || model.includes("qwen3-vl-rerank");
}

function isDeepSeekProvider(input: ProviderConnectionTestInput): boolean {
  return normalizeProviderIdentity(input).includes("deepseek");
}

function isDashScopeProvider(input: ProviderConnectionTestInput): boolean {
  const identity = normalizeProviderIdentity(input);

  return (
    identity.includes("dashscope") ||
    identity.includes("bailian") ||
    identity.includes("aliyun") ||
    identity.includes("gte-rerank") ||
    identity.includes("qwen") ||
    identity.includes("百炼") ||
    identity.includes("通义")
  );
}

function normalizeProviderIdentity(input: ProviderConnectionTestInput): string {
  return `${input.provider} ${input.modelId} ${input.baseUrl}`.toLowerCase();
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "AbortError"
  );
}

export function createInMemoryProviderConfigRepository(): ProviderConfigRepository & {
  inspect(): {
    configs: ProviderConfigRecord[];
    secrets: ProviderSecretRecord[];
  };
} {
  const configs = new Map<string, ProviderConfigRecord>();
  const secrets = new Map<string, ProviderSecretRecord>();

  return {
    async listProviderConfigs(input) {
      return Array.from(configs.values()).filter(
        (config) => config.tenantId === input.tenantId,
      );
    },
    async getProviderConfig(input) {
      return configs.get(configKey(input.tenantId, input.kind)) ?? null;
    },
    async getSecret(input) {
      const secret = secrets.get(input.secretRecordId) ?? null;
      return secret?.tenantId === input.tenantId ? secret : null;
    },
    async saveProviderConfig(input) {
      const key = configKey(input.tenantId, input.kind);
      const existing = configs.get(key) ?? null;

      if (input.secret !== null) {
        secrets.set(input.secret.id, {
          encryptedPayload: input.secret.encryptedPayload,
          id: input.secret.id,
          keyVersion: input.secret.keyVersion,
          metadata: input.secret.metadata,
          tenantId: input.secret.tenantId,
        });
      }

      const config: ProviderConfigRecord = {
        baseUrl: input.baseUrl,
        displayName: input.displayName,
        id: existing?.id ?? `provider_${input.kind}_${configs.size + 1}`,
        keyVersion: input.secret?.keyVersion ?? existing?.keyVersion ?? null,
        kind: input.kind,
        maskedKey:
          getMetadataString(input.secret?.metadata ?? null, "maskedKey") ??
          existing?.maskedKey ??
          null,
        modelId: input.modelId,
        provider: input.provider,
        secretRecordId: input.secret?.id ?? existing?.secretRecordId ?? null,
        status: input.status,
        tenantId: input.tenantId,
        updatedAt: new Date("2026-05-23T00:00:00.000Z"),
      };
      configs.set(key, config);

      return {
        config,
        created: existing === null,
      };
    },
    inspect() {
      return {
        configs: Array.from(configs.values()),
        secrets: Array.from(secrets.values()),
      };
    },
  };
}

export function createDrizzleProviderConfigRepository(
  db: ProjectDb,
): ProviderConfigRepository {
  return {
    async listProviderConfigs(input) {
      const rows = await db
        .select({
          config: providerConfigs,
          secret: secretRecords,
        })
        .from(providerConfigs)
        .leftJoin(
          secretRecords,
          and(
            eq(providerConfigs.tenantId, secretRecords.tenantId),
            eq(providerConfigs.secretRecordId, secretRecords.id),
          ),
        )
        .where(eq(providerConfigs.tenantId, input.tenantId));

      return rows.map((row) => mapProviderConfigRow(row.config, row.secret));
    },
    async getProviderConfig(input) {
      const rows = await db
        .select({
          config: providerConfigs,
          secret: secretRecords,
        })
        .from(providerConfigs)
        .leftJoin(
          secretRecords,
          and(
            eq(providerConfigs.tenantId, secretRecords.tenantId),
            eq(providerConfigs.secretRecordId, secretRecords.id),
          ),
        )
        .where(
          and(
            eq(providerConfigs.tenantId, input.tenantId),
            eq(providerConfigs.kind, input.kind),
          ),
        )
        .limit(1);

      const row = rows[0];
      return row === undefined ? null : mapProviderConfigRow(row.config, row.secret);
    },
    async getSecret(input) {
      const rows = await db
        .select()
        .from(secretRecords)
        .where(
          and(
            eq(secretRecords.tenantId, input.tenantId),
            eq(secretRecords.id, input.secretRecordId),
          ),
        )
        .limit(1);
      const row = rows[0];

      return row === undefined ? null : mapSecretRow(row);
    },
    async saveProviderConfig(input) {
      return db.transaction(async (tx) => {
        if (input.secret !== null) {
          await tx.insert(secretRecords).values({
            createdByUserId: input.secret.createdByUserId,
            encryptedPayload: input.secret.encryptedPayload,
            id: input.secret.id,
            keyVersion: input.secret.keyVersion,
            metadata: input.secret.metadata,
            purpose: providerSecretPurpose,
            tenantId: input.secret.tenantId,
          });
        }

        const existingRows = await tx
          .select()
          .from(providerConfigs)
          .where(
            and(
              eq(providerConfigs.tenantId, input.tenantId),
              eq(providerConfigs.kind, input.kind),
            ),
          )
          .limit(1);
        const existing = existingRows[0] ?? null;
        const secretRecordId = input.secret?.id ?? existing?.secretRecordId ?? null;
        const configRows =
          existing === null
            ? await tx
                .insert(providerConfigs)
                .values({
                  baseUrl: input.baseUrl,
                  createdByUserId: input.actorId,
                  displayName: input.displayName,
                  kind: input.kind,
                  modelId: input.modelId,
                  provider: input.provider,
                  secretRecordId,
                  status: input.status,
                  tenantId: input.tenantId,
                })
                .returning()
            : await tx
                .update(providerConfigs)
                .set({
                  baseUrl: input.baseUrl,
                  displayName: input.displayName,
                  modelId: input.modelId,
                  provider: input.provider,
                  secretRecordId,
                  status: input.status,
                  updatedAt: sql`NOW()`,
                })
                .where(eq(providerConfigs.id, existing.id))
                .returning();
        const config = configRows[0];
        if (config === undefined) {
          throw new Error("Provider config save failed.");
        }

        const secret =
          input.secret === null && secretRecordId !== null
            ? ((
                await tx
                  .select()
                  .from(secretRecords)
                  .where(
                    and(
                      eq(secretRecords.tenantId, input.tenantId),
                      eq(secretRecords.id, secretRecordId),
                    ),
                  )
                  .limit(1)
              )[0] ?? null)
            : input.secret;

        return {
          config: mapProviderConfigRow(config, secret),
          created: existing === null,
        };
      });
    },
  };
}

function summarizeConfigs(configs: ProviderConfigRecord[]): ProviderSummary[] {
  return modelServiceKindOrder.map((kind) => {
    const config = configs.find((item) => item.kind === kind) ?? null;
    return summarizeConfig(config, kind);
  });
}

function summarizeConfig(
  config: ProviderConfigRecord | null,
  fallbackKind?: ModelServiceKind,
): ProviderSummary {
  const kind = config?.kind ?? fallbackKind;
  if (kind === undefined) {
    throw new Error("Missing provider kind.");
  }

  if (config === null) {
    return {
      id: null,
      kind,
      label: modelServiceKindLabels[kind],
      configured: false,
      displayName: null,
      provider: null,
      modelId: null,
      baseUrl: null,
      status: null,
      maskedKey: null,
      keyVersion: null,
      updatedAt: null,
    };
  }

  const secretMetadata = getSecretMetadata(config);

  return {
    id: config.id,
    kind,
    label: modelServiceKindLabels[kind],
    configured: true,
    displayName: config.displayName,
    provider: config.provider,
    modelId: config.modelId,
    baseUrl: config.baseUrl,
    status: config.status,
    maskedKey: secretMetadata.maskedKey,
    keyVersion: secretMetadata.keyVersion,
    updatedAt: config.updatedAt.toISOString(),
  };
}

async function resolveCandidateApiKey(input: {
  actor: ProviderConfigActor;
  body: ProviderConfigServiceSaveBody;
  encryptionKey: Aes256GcmKey;
  existingConfig: ProviderConfigRecord | null;
  repository: ProviderConfigRepository;
}): Promise<
  | {
      ok: true;
      apiKey: string;
      existingPlaintext: string | null;
      source: "existing" | "new";
    }
  | ProviderConfigServiceError
> {
  if (input.body.apiKey.mode === "plaintext") {
    const existingPlaintext = await decryptExistingApiKey({
      actor: input.actor,
      encryptionKey: input.encryptionKey,
      existingConfig: input.existingConfig,
      repository: input.repository,
    });
    if (!existingPlaintext.ok) {
      return existingPlaintext;
    }

    return {
      ok: true,
      apiKey: input.body.apiKey.value,
      existingPlaintext: existingPlaintext.apiKey,
      source: "new",
    };
  }

  if (input.existingConfig === null || input.existingConfig.secretRecordId === null) {
    return createValidationError("首次配置模型服务必须提供 API Key。");
  }

  const existingPlaintext = await decryptExistingApiKey({
    actor: input.actor,
    encryptionKey: input.encryptionKey,
    existingConfig: input.existingConfig,
    repository: input.repository,
  });
  if (!existingPlaintext.ok) {
    return existingPlaintext;
  }

  if (existingPlaintext.apiKey === null) {
    return createValidationError("首次配置模型服务必须提供 API Key。");
  }

  return {
    ok: true,
    apiKey: existingPlaintext.apiKey,
    existingPlaintext: existingPlaintext.apiKey,
    source: "existing",
  };
}

async function decryptExistingApiKey(input: {
  actor: ProviderConfigActor;
  encryptionKey: Aes256GcmKey;
  existingConfig: ProviderConfigRecord | null;
  repository: ProviderConfigRepository;
}): Promise<{ ok: true; apiKey: string | null } | ProviderConfigServiceError> {
  if (input.existingConfig?.secretRecordId === null || input.existingConfig === null) {
    return {
      ok: true,
      apiKey: null,
    };
  }

  const secret = await input.repository.getSecret({
    secretRecordId: input.existingConfig.secretRecordId,
    tenantId: input.actor.tenant.id,
  });
  if (secret === null) {
    return createInternalError();
  }

  try {
    const envelope = aes256GcmEnvelopeSchema.parse(JSON.parse(secret.encryptedPayload));
    const apiKey = await decryptAes256Gcm({
      aad: createSecretAad({
        keyVersion: secret.keyVersion,
        secretRecordId: secret.id,
        tenantId: secret.tenantId,
      }),
      envelope,
      key: input.encryptionKey,
    });

    return {
      ok: true,
      apiKey,
    };
  } catch {
    return createInternalError();
  }
}

async function createEncryptedSecret(input: {
  actorId: string;
  apiKey: string;
  encryptionKey: Aes256GcmKey;
  existingConfig: ProviderConfigRecord | null;
  tenantId: string;
}): Promise<ProviderSecretCreateInput> {
  const id = crypto.randomUUID();
  const keyVersion = nextKeyVersion(getSecretMetadata(input.existingConfig).keyVersion);
  const encrypted = await encryptAes256Gcm({
    aad: createSecretAad({
      keyVersion,
      secretRecordId: id,
      tenantId: input.tenantId,
    }),
    key: input.encryptionKey,
    keyVersion,
    plaintext: input.apiKey,
  });

  return {
    createdByUserId: input.actorId,
    encryptedPayload: JSON.stringify(encrypted),
    id,
    keyVersion,
    metadata: {
      maskedKey: maskSecret(input.apiKey),
      keyVersion,
    },
    tenantId: input.tenantId,
  };
}

function getSecretMetadata(config: ProviderConfigRecord | null): {
  keyVersion: string | null;
  maskedKey: string | null;
} {
  if (config === null) {
    return {
      keyVersion: null,
      maskedKey: null,
    };
  }

  return {
    keyVersion: config.keyVersion,
    maskedKey: config.maskedKey,
  };
}

function getMetadataString(
  metadata: Record<string, unknown> | null,
  key: string,
): string | null {
  const value = metadata?.[key];
  return typeof value === "string" ? value : null;
}

function nextKeyVersion(current: string | null): string {
  if (current === null) {
    return "v1";
  }

  const match = /^v(\d+)$/.exec(current);
  if (match === null) {
    return "v1";
  }

  return `v${Number.parseInt(match[1] ?? "1", 10) + 1}`;
}

function createSecretAad(input: {
  keyVersion: string;
  secretRecordId: string;
  tenantId: string;
}): Record<string, string> {
  return {
    keyVersion: input.keyVersion,
    purpose: providerSecretPurpose,
    secretRecordId: input.secretRecordId,
    tenantId: input.tenantId,
  };
}

function mapProviderConnectionError(code: ProviderErrorCode): ProviderConfigServiceError {
  if (code === "PROVIDER_AUTH_FAILED") {
    return {
      ok: false,
      code: "FORBIDDEN",
      httpStatus: 403,
      message: "模型服务认证失败，请检查 API Key。",
    };
  }

  if (code === "PROVIDER_RATE_LIMITED") {
    return {
      ok: false,
      code: "RATE_LIMITED",
      httpStatus: 429,
      message: "模型服务请求过于频繁，请稍后重试。",
    };
  }

  if (
    code === "PROVIDER_INVALID_REQUEST" ||
    code === "PROVIDER_UNSUPPORTED_MODEL" ||
    code === "PROVIDER_CONTENT_REJECTED"
  ) {
    return createValidationError("模型服务连接测试失败，请检查配置后重试。");
  }

  return {
    ok: false,
    code: "PROVIDER_UNAVAILABLE",
    httpStatus: 500,
    message: "模型服务暂时不可用，请稍后重试。",
  };
}

function getMutationAuditAction(input: {
  created: boolean;
  keyRotated: boolean;
  status: ProviderStatus;
}): ProviderAuditEventInput["action"] {
  if (input.status === "disabled") {
    return "provider_config.disabled";
  }

  if (input.keyRotated) {
    return "provider_config.key_rotated";
  }

  return input.created ? "provider_config.created" : "provider_config.updated";
}

function createValidationError(message: string): ProviderConfigServiceError {
  return {
    ok: false,
    code: "VALIDATION_ERROR",
    httpStatus: 400,
    message,
  };
}

function createInternalError(): ProviderConfigServiceError {
  return {
    ok: false,
    code: "INTERNAL_ERROR",
    httpStatus: 500,
    message: "操作失败，请稍后重试。",
  };
}

async function recordAudit(
  options: ProviderConfigServiceOptions,
  input: ProviderAuditEventInput,
): Promise<void> {
  await options.auditRecorder?.(input);
}

function configKey(tenantId: string, kind: ModelServiceKind): string {
  return `${tenantId}:${kind}`;
}

function mapProviderConfigRow(
  config: typeof providerConfigs.$inferSelect,
  secret: typeof secretRecords.$inferSelect | ProviderSecretCreateInput | null,
): ProviderConfigRecord {
  return {
    baseUrl: config.baseUrl,
    displayName: config.displayName,
    id: config.id,
    keyVersion: secret?.keyVersion ?? null,
    kind: config.kind,
    maskedKey: getMetadataString(secret?.metadata ?? null, "maskedKey"),
    modelId: config.modelId,
    provider: config.provider,
    secretRecordId: config.secretRecordId,
    status: config.status,
    tenantId: config.tenantId,
    updatedAt: config.updatedAt,
  };
}

function mapSecretRow(row: typeof secretRecords.$inferSelect): ProviderSecretRecord {
  return {
    encryptedPayload: row.encryptedPayload,
    id: row.id,
    keyVersion: row.keyVersion,
    metadata: row.metadata,
    tenantId: row.tenantId,
  };
}
