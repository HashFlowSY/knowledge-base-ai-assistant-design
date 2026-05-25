import {
  modelServiceKindLabels,
  modelServiceKindOrder,
  type ProviderPublicKey,
} from "@kb/ai-providers";
import {
  decryptRsaOaep,
  generateRsaOaepKeyPair,
  type RsaOaepKeyPair,
} from "@kb/security";

import type {
  ApiServiceError,
  AuditService,
  AuthService,
  DocumentService,
  KnowledgeBaseService,
  ProviderConfigApiService,
  ProviderTransportKeyService,
  UserService,
} from "../contracts";

export function createUnauthenticatedAuthService(): AuthService {
  return {
    async login() {
      return {
        ok: false,
        code: "UNAUTHORIZED",
        httpStatus: 401,
        message: "邮箱或密码不正确。",
      };
    },
    async logout() {
      return { ok: true };
    },
    async getSession() {
      return {
        ok: false,
        code: "UNAUTHORIZED",
        httpStatus: 401,
        message: "请先登录。",
      };
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
      return createNotImplementedServiceError();
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
        return {
          ok: false,
          code: "VALIDATION_ERROR",
          httpStatus: 400,
          message: "密钥传输凭证已过期，请重新保存。",
        };
      }

      const plaintext = await decryptRsaOaep({
        ciphertext: decryptInput.ciphertext,
        privateKey: keyPair.privateKey,
      });

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
      return createNotImplementedServiceError();
    },
    async getUser() {
      return createNotImplementedServiceError();
    },
    async updateUser() {
      return createNotImplementedServiceError();
    },
    async removeUserAccess() {
      return createNotImplementedServiceError();
    },
  };
}

export function createEmptyDocumentService(): DocumentService {
  return {
    async uploadDocumentFile() {
      return createNotImplementedServiceError();
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
      return createNotImplementedServiceError();
    },
    async createKnowledgeBase() {
      return createNotImplementedServiceError();
    },
    async updateKnowledgeBase() {
      return createNotImplementedServiceError();
    },
  };
}

function createNotImplementedServiceError(): ApiServiceError {
  return {
    ok: false,
    code: "INTERNAL_ERROR",
    httpStatus: 500,
    message: "操作失败，请稍后重试。",
  };
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
