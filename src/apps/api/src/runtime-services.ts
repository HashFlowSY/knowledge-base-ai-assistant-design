import { loadRuntimeConfig, type RuntimeConfig } from "@kb/config";
import {
  createPostgresJsDatabase,
  databaseConfigSchema,
  auditLogs,
  type ProjectDbRuntime,
} from "@kb/db";
import { createKnowledgeBaseService } from "@kb/knowledge/service";
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
  KnowledgeBaseService,
  UserService,
} from "./contracts";

export interface ApiRuntimeServices extends Required<ApiAppOptions> {
  close(): Promise<void>;
}

export interface ApiRuntimeServiceConfig {
  appBaseUrl: string;
  betterAuthSecret: string;
  databaseUrl: string;
  redisUrl: string;
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
  const knowledgeBaseService = createKnowledgeBaseService({ db: dbRuntime.db });
  const userService = createUserManagementService({ db: dbRuntime.db });
  const auditService: AuditService = {
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
    redisUrl: config.REDIS_URL,
  });
}

export type {
  ApiRateLimiter,
  AuditService,
  AuthService,
  KnowledgeBaseService,
  ProjectDbRuntime,
  UserService,
};
