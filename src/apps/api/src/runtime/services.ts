import { loadRuntimeConfig, type RuntimeConfig } from "@kb/config";
import { createAuditLogRecorder } from "@kb/audit";
import { createLogger } from "@kb/observability";
import {
  createPostgresJsDatabase,
  databaseConfigSchema,
  type ProjectDbRuntime,
} from "@kb/db";
import {
  createDrizzleProviderConfigRepository,
  createEmbeddingService,
  createProviderConnectionTester,
  createProviderConfigService,
} from "@kb/ai-providers/service";
import {
  createProviderChatService,
  createProviderRerankService,
} from "@kb/ai-providers/runtime";
import { createKnowledgeBaseService } from "@kb/knowledge/service";
import { createBullMqIngestionQueueProducer } from "@kb/queue/producer";
import {
  createRagChatService,
} from "@kb/rag";
import { createDrizzleRagChatRepository } from "@kb/rag/drizzle";
import { normalizeAes256GcmKey } from "@kb/security";
import { createMeiliKeywordSearcher } from "@kb/search";
import {
  createS3ObjectStorageClient,
  objectStorageConfigSchema,
  type ObjectStorageConfig,
} from "@kb/storage";
import { createUserManagementService } from "@kb/users/service";

import { createBetterAuthService } from "../modules/auth/lib/better-auth-service";
import { createInMemoryProviderTransportKeyService } from "./defaults";
import { createKnowledgeServiceAdapters } from "./knowledge-adapter";
import {
  createRateLimiter,
  createRedisClient,
  createRedisRateLimitStore,
} from "../rate-limit";
import type {
  ApiAppOptions,
  ApiRateLimiter,
  AuditService,
  AuthService,
  DocumentService,
  KnowledgeBaseService,
  ProviderConfigApiService,
  ProviderTransportKeyService,
  UploadConfig,
  UserService,
} from "../contracts";
import { createInMemoryUploadConcurrencyLimiter } from "../modules/documents/lib/upload-concurrency";

export interface ApiRuntimeServices extends Required<ApiAppOptions> {
  close(): Promise<void>;
}

export interface ApiRuntimeServiceConfig {
  appBaseUrl: string;
  betterAuthSecret: string;
  appEncryptionKey: string;
  databaseUrl: string;
  ingestionQueueConfig: {
    attempts: number;
    backoffMs: number;
  };
  meiliSearch: {
    apiKey: string;
    host: string;
  };
  objectStorage: ObjectStorageConfig;
  redisUrl: string;
  uploadConfig: UploadConfig;
}

export function createApiRuntimeServices(
  input: ApiRuntimeServiceConfig,
): ApiRuntimeServices {
  const dbRuntime = createPostgresJsDatabase(
    databaseConfigSchema.parse({
      databaseUrl: input.databaseUrl,
    }),
  );
  const redis = createRedisClient(input.redisUrl);
  const rateLimiter = createRateLimiter({
    store: createRedisRateLimitStore(redis),
  });
  const objectStorage = createS3ObjectStorageClient(input.objectStorage);
  const logger = createLogger({ service: "api" });
  const encryptionKey = normalizeAes256GcmKey(input.appEncryptionKey);
  const providerRepository = createDrizzleProviderConfigRepository(dbRuntime.db);
  const ingestionQueueProducer = createBullMqIngestionQueueProducer({
    attempts: input.ingestionQueueConfig.attempts,
    backoffMs: input.ingestionQueueConfig.backoffMs,
    redisUrl: input.redisUrl,
  });
  const packageKnowledgeBaseService = createKnowledgeBaseService({
    db: dbRuntime.db,
    ingestionQueueProducer,
    logger,
    objectStorage,
    sourceBucket: input.objectStorage.bucket,
  });
  const knowledgeAdapters = createKnowledgeServiceAdapters(
    packageKnowledgeBaseService,
  );
  const userService = createUserManagementService({ db: dbRuntime.db });
  const auditRecorder = createAuditLogRecorder(dbRuntime.db);
  const providerConfigService = createProviderConfigService({
    auditRecorder: async (event) => {
      await auditRecorder.record({
        tenantId: event.tenantId,
        actorId: event.actorId,
        actorType: "user",
        action: event.action,
        targetType: "provider_config",
        targetId: event.targetId,
        metadata: event.metadata,
        requestId: event.requestId,
        ipSummary: event.ipSummary,
        userAgentSummary: event.userAgentSummary,
      });
    },
    connectionTester: createProviderConnectionTester(),
    encryptionKey,
    repository: providerRepository,
  });
  const embeddingService = createEmbeddingService({
    encryptionKey,
    repository: providerRepository,
  });
  const providerChatService = createProviderChatService({
    encryptionKey,
    repository: providerRepository,
  });
  const providerRerankService = createProviderRerankService({
    encryptionKey,
    repository: providerRepository,
  });
  const keywordSearcher = createMeiliKeywordSearcher(input.meiliSearch);
  const chatService = createRagChatService({
    answerGenerator: {
      async generate(chatInput) {
        return providerChatService.generate({
          messages: [
            {
              role: "system",
              content:
                "你只能基于给定知识库上下文回答。没有依据时明确说明知识库中没有找到。",
            },
            {
              role: "user",
              content: `问题：${chatInput.question}\n\n上下文：\n${chatInput.context}`,
            },
          ],
          requestId: chatInput.requestId,
          tenantId: chatInput.tenantId,
        });
      },
    },
    embeddingProvider: {
      async embedQuery(embedInput) {
        const result = await embeddingService.embed({
          inputs: [embedInput.query],
          requestId: embedInput.requestId,
          tenantId: embedInput.tenantId,
        });
        if (!result.ok) {
          return { ok: false, code: result.code };
        }

        const vector = result.vectors[0];
        return vector === undefined
          ? { ok: false, code: "PROVIDER_INVALID_REQUEST" }
          : { ok: true, vector };
      },
    },
    keywordSearcher,
    logger: logger.child({ action: "chat.rag" }),
    repository: createDrizzleRagChatRepository(dbRuntime.db),
    reranker: {
      async rerank(rerankInput) {
        const result = await providerRerankService.rerank({
          documents: rerankInput.candidates.map((candidate) => ({
            id: candidate.chunkId,
            text: candidate.content,
          })),
          query: rerankInput.query,
          requestId: rerankInput.requestId,
          tenantId: rerankInput.tenantId,
        });
        return result.ok
          ? {
              ok: true,
              results: result.results.map((item) => ({
                chunkId: item.id,
                score: item.score,
              })),
            }
          : result;
      },
    },
  });
  const auditService: AuditService = {
    async recordDocumentUploadSecurityFailure(event) {
      await auditRecorder.record({
        tenantId: event.actor.tenant.id,
        actorId: event.actor.user.id,
        actorType: "user",
        action: "document.upload_rejected",
        targetType: "knowledge_base",
        targetId: event.knowledgeBaseId,
        metadata: {
          ...event.metadata,
          reason: event.reason,
        },
        requestId: event.requestId,
        ipSummary: event.ipSummary,
        userAgentSummary: event.userAgentSummary,
      });
    },
    async recordForbiddenAdminAttempt(event) {
      await auditRecorder.record({
        tenantId: event.actor.tenant.id,
        actorId: event.actor.user.id,
        actorType: "user",
        action: event.action,
        targetType: event.targetType,
        targetId: event.targetId,
        metadata: {
          method: event.method,
          path: event.path,
          reason: "admin_required",
        },
        requestId: event.requestId,
        ipSummary: event.ipSummary,
        userAgentSummary: event.userAgentSummary,
      });
    },
  };

  return {
    allowedOrigins: [input.appBaseUrl],
    auditService,
    authService: createBetterAuthService({
      appBaseUrl: input.appBaseUrl,
      betterAuthSecret: input.betterAuthSecret,
      db: dbRuntime.db,
    }),
    chatService,
    knowledgeBaseService: knowledgeAdapters.knowledgeBaseService,
    logger,
    providerConfigService: providerConfigService as ProviderConfigApiService,
    providerTransportKeyService: createInMemoryProviderTransportKeyService(),
    rateLimiter,
    documentService: knowledgeAdapters.documentService,
    uploadConcurrencyLimiter: createInMemoryUploadConcurrencyLimiter(),
    uploadConfig: input.uploadConfig,
    userService: userService as UserService,
    async close() {
      await ingestionQueueProducer.close();
      redis.disconnect();
      await dbRuntime.pool.end();
    },
  };
}

export function createApiRuntimeServicesFromEnv(
  env: NodeJS.ProcessEnv,
): ApiRuntimeServices {
  const config: RuntimeConfig = loadRuntimeConfig(env);

  return createApiRuntimeServices({
    appBaseUrl: config.APP_BASE_URL,
    appEncryptionKey: config.APP_ENCRYPTION_KEY,
    betterAuthSecret: config.BETTER_AUTH_SECRET,
    databaseUrl: config.DATABASE_URL,
    ingestionQueueConfig: {
      attempts: config.INGESTION_QUEUE_ATTEMPTS,
      backoffMs: config.INGESTION_QUEUE_BACKOFF_MS,
    },
    meiliSearch: {
      apiKey: config.MEILISEARCH_MASTER_KEY,
      host: config.MEILISEARCH_HOST,
    },
    objectStorage: objectStorageConfigSchema.parse({
      accessKeyId: config.S3_ACCESS_KEY_ID,
      bucket: config.S3_BUCKET,
      endpoint: config.S3_ENDPOINT,
      secretAccessKey: config.S3_SECRET_ACCESS_KEY,
    }),
    redisUrl: config.REDIS_URL,
    uploadConfig: {
      concurrencyPerActor: config.UPLOAD_CONCURRENCY_PER_ACTOR,
      concurrencyPerTenant: config.UPLOAD_CONCURRENCY_PER_TENANT,
      maxFileBytes: config.UPLOAD_MAX_FILE_BYTES,
      rateLimitPerMinute: config.UPLOAD_RATE_LIMIT_PER_MINUTE,
      requestOverheadBytes: config.UPLOAD_REQUEST_OVERHEAD_BYTES,
    },
  });
}

export type {
  ApiRateLimiter,
  AuditService,
  AuthService,
  DocumentService,
  KnowledgeBaseService,
  ProviderConfigApiService,
  ProviderTransportKeyService,
  ProjectDbRuntime,
  UploadConfig,
  UserService,
};
