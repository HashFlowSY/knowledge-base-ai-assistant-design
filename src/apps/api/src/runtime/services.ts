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
  createProviderConnectionTester,
  createProviderConfigService,
} from "@kb/ai-providers/service";
import { createKnowledgeBaseService } from "@kb/knowledge/service";
import { createBullMqIngestionQueueProducer } from "@kb/queue/producer";
import { normalizeAes256GcmKey } from "@kb/security";
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
    encryptionKey: normalizeAes256GcmKey(input.appEncryptionKey),
    repository: createDrizzleProviderConfigRepository(dbRuntime.db),
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
