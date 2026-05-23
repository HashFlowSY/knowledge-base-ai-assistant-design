import { loadRuntimeConfig, type RuntimeConfig } from "@kb/config";
import {
  createPostgresJsDatabase,
  databaseConfigSchema,
  auditLogs,
  type ProjectDbRuntime,
} from "@kb/db";
import { createKnowledgeBaseService } from "@kb/knowledge/service";
import {
  createS3ObjectStorageClient,
  objectStorageConfigSchema,
  type ObjectStorageConfig,
} from "@kb/storage";
import { createUserManagementService } from "@kb/users/service";

import { createBetterAuthService } from "./auth-service";
import {
  createRateLimiter,
  createRedisClient,
  createRedisRateLimitStore,
} from "./rate-limit";
import type {
  ApiAppOptions,
  ApiRateLimiter,
  AuditService,
  AuthService,
  DocumentService,
  KnowledgeBaseService,
  UploadConfig,
  UserService,
} from "./contracts";
import { createInMemoryUploadConcurrencyLimiter } from "./upload-concurrency";

export interface ApiRuntimeServices extends Required<ApiAppOptions> {
  close(): Promise<void>;
}

export interface ApiRuntimeServiceConfig {
  appBaseUrl: string;
  betterAuthSecret: string;
  databaseUrl: string;
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
  const knowledgeBaseService = createKnowledgeBaseService({
    db: dbRuntime.db,
    objectStorage,
    sourceBucket: input.objectStorage.bucket,
  });
  const userService = createUserManagementService({ db: dbRuntime.db });
  const auditService: AuditService = {
    async recordDocumentUploadSecurityFailure(event) {
      await dbRuntime.db.insert(auditLogs).values({
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
      await dbRuntime.db.insert(auditLogs).values({
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
    knowledgeBaseService: knowledgeBaseService as KnowledgeBaseService,
    rateLimiter,
    documentService: knowledgeBaseService as DocumentService,
    uploadConcurrencyLimiter: createInMemoryUploadConcurrencyLimiter(),
    uploadConfig: input.uploadConfig,
    userService: userService as UserService,
    async close() {
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
    betterAuthSecret: config.BETTER_AUTH_SECRET,
    databaseUrl: config.DATABASE_URL,
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
  ProjectDbRuntime,
  UploadConfig,
  UserService,
};
