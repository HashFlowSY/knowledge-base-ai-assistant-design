import {
  modelServiceKindLabels,
  modelServiceKindOrder,
  type ProviderPublicKey,
} from "@kb/ai-providers";
import { internalError, unauthorized, validationError } from "@kb/errors";
import {
  decryptRsaOaep,
  generateRsaOaepKeyPair,
  type RsaOaepKeyPair,
} from "@kb/security";

import type {
  AuditService,
  AuthService,
  ChatService,
  DocumentService,
  KnowledgeBaseService,
  ProviderConfigApiService,
  ProviderTransportKeyService,
  UserService,
} from "../contracts";

export function createUnauthenticatedAuthService(): AuthService {
  return {
    async login() {
      throw unauthorized({
        domain: "auth",
        reason: "invalid_credentials",
        message: "邮箱或密码不正确。",
      });
    },
    async logout() {
      return { ok: true };
    },
    async getSession() {
      throw unauthorized({
        domain: "auth",
        reason: "missing_session",
        message: "请先登录。",
      });
    },
  };
}

export function createNoopAuditService(): AuditService {
  return {
    async recordDocumentUploadSecurityFailure() {
      return undefined;
    },
    async recordForbiddenAdminAttempt() {
      return undefined;
    },
  };
}

export function createEmptyProviderConfigService(): ProviderConfigApiService {
  return {
    async listProviderConfigs() {
      return {
        ok: true,
        providers: modelServiceKindOrder.map((kind) => ({
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
        })),
      };
    },
    async saveProviderConfig() {
      throw createNotImplementedAppError();
    },
  };
}

export function createInMemoryProviderTransportKeyService(input: {
  now?: () => Date;
  ttlMs?: number;
} = {}): ProviderTransportKeyService {
  const now = input.now ?? (() => new Date());
  const ttlMs = input.ttlMs ?? 5 * 60_000;
  const keyPairs = new Map<string, RsaOaepKeyPair>();

  return {
    async createPublicKey(): Promise<ProviderPublicKey> {
      pruneExpiredKeys(keyPairs, now());
      const createdAt = now();
      const keyId = `provider_transport_${crypto.randomUUID()}`;
      const expiresAt = new Date(createdAt.getTime() + ttlMs).toISOString();
      const keyPair = await generateRsaOaepKeyPair({
        expiresAt,
        keyId,
      });
      keyPairs.set(keyId, keyPair);

      return {
        alg: keyPair.alg,
        expiresAt: keyPair.expiresAt,
        keyId: keyPair.keyId,
        publicKey: keyPair.publicKey,
      };
    },
    async decryptApiKey(decryptInput) {
      pruneExpiredKeys(keyPairs, now());
      const keyPair = keyPairs.get(decryptInput.keyId) ?? null;
      if (keyPair === null || Date.parse(keyPair.expiresAt) <= now().getTime()) {
        throw validationError({
          domain: "providers",
          reason: "transport_key_expired",
          message: "密钥传输凭证已过期，请重新保存。",
        });
      }

      let plaintext: string;
      try {
        plaintext = await decryptRsaOaep({
          ciphertext: decryptInput.ciphertext,
          privateKey: keyPair.privateKey,
        });
      } catch (error) {
        throw validationError(
          {
            domain: "providers",
            reason: "transport_key_invalid",
            message: "密钥传输凭证无效，请重新保存。",
          },
          { cause: error },
        );
      }

      return {
        ok: true,
        plaintext,
      };
    },
  };
}

export function createEmptyUserService(): UserService {
  return {
    async listUsers() {
      return {
        ok: true,
        page: {
          items: [],
          page: 1,
          pageSize: 8,
          total: 0,
        },
      };
    },
    async createUser() {
      throw createNotImplementedAppError();
    },
    async getUser() {
      throw createNotImplementedAppError();
    },
    async updateUser() {
      throw createNotImplementedAppError();
    },
    async removeUserAccess() {
      throw createNotImplementedAppError();
    },
  };
}

export function createEmptyDocumentService(): DocumentService {
  return {
    async listDocumentProcessing() {
      throw createNotImplementedAppError();
    },
    async retryDocumentProcessing() {
      throw createNotImplementedAppError();
    },
    async uploadDocumentFile() {
      throw createNotImplementedAppError();
    },
  };
}

export function createEmptyKnowledgeBaseService(): KnowledgeBaseService {
  return {
    async listKnowledgeBases() {
      return {
        ok: true,
        page: {
          items: [],
          page: 1,
          pageSize: 8,
          total: 0,
        },
      };
    },
    async getKnowledgeBase() {
      throw createNotImplementedAppError();
    },
    async createKnowledgeBase() {
      throw createNotImplementedAppError();
    },
    async updateKnowledgeBase() {
      throw createNotImplementedAppError();
    },
  };
}

export function createEmptyChatService(): ChatService {
  return {
    async listSessions() {
      return { ok: true, result: { sessions: [] } };
    },
    async createSession() {
      throw createNotImplementedAppError();
    },
    async listMessages() {
      return { ok: true, result: { messages: [] } };
    },
    async submitQuestion() {
      throw createNotImplementedAppError();
    },
    async submitFeedback() {
      throw createNotImplementedAppError();
    },
  };
}

function createNotImplementedAppError(): Error {
  return internalError({
    domain: "api",
    reason: "not_implemented",
    message: "操作失败，请稍后重试。",
  });
}

function pruneExpiredKeys(
  keyPairs: Map<string, RsaOaepKeyPair>,
  now: Date,
): void {
  for (const [keyId, keyPair] of keyPairs.entries()) {
    if (Date.parse(keyPair.expiresAt) <= now.getTime()) {
      keyPairs.delete(keyId);
    }
  }
}
