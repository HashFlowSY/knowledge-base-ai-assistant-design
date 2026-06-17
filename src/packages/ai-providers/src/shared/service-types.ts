import type { Aes256GcmKey } from "@kb/security";

import type {
  ModelServiceKind,
  ProviderErrorCode,
  ProviderStatus,
  ProviderSummary,
} from "../index";

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

export type ProviderConnectionFetch = (
  input: string,
  init: RequestInit,
) => Promise<Response>;

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

export interface ProviderConfigService {
  listProviderConfigs(input: {
    actor: ProviderConfigActor;
  }): Promise<{ ok: true; providers: ProviderSummary[] }>;
  saveProviderConfig(input: {
    actor: ProviderConfigActor;
    body: ProviderConfigServiceSaveBody;
    ipSummary?: string | null;
    kind: ModelServiceKind;
    requestId: string;
    userAgentSummary?: string | null;
  }): Promise<{ ok: true; provider: ProviderSummary }>;
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
