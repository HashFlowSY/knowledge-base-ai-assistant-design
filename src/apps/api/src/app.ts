import { Hono } from "hono";

import {
  defaultUploadConcurrencyPerActor,
  defaultUploadConcurrencyPerTenant,
  defaultUploadMaxFileBytes,
  defaultUploadRateLimitPerMinute,
  defaultUploadRequestOverheadBytes,
} from "@kb/config";
import { createLogger, createSafeErrorLogFields } from "@kb/observability";
import { isAppError } from "@kb/errors";

import type {
  ApiApp,
  ApiAppOptions,
  ApiEnv,
  ChatService,
  DocumentService,
  KnowledgeBaseService,
  ProviderConfigApiService,
  UploadConfig,
  UserService,
} from "./contracts";
export type {
  ApiApp,
  ApiAppOptions,
  ApiContextVariables,
  ApiEnv,
  ApiRateLimiter,
  ApiRuntimeResource,
  AuditService,
  AuthService,
  ChatService,
  DocumentFileUploadResult,
  DocumentFileUploadServiceInput,
  DocumentProcessingListQuery,
  DocumentProcessingPage,
  DocumentProcessingSummary,
  DocumentService,
  KnowledgeBaseService,
  ProviderConfigApiService,
  ProviderTransportKeyService,
  RetryDocumentProcessingResult,
  UploadConcurrencyLimiter,
  UploadConcurrencyReservation,
  UploadConfig,
  UserService,
} from "./contracts";
import {
  createEmptyChatService,
  createEmptyDocumentService,
  createEmptyKnowledgeBaseService,
  createEmptyProviderConfigService,
  createEmptyUserService,
  createInMemoryProviderTransportKeyService,
  createNoopAuditService,
  createUnauthenticatedAuthService,
} from "./runtime/defaults";
import { createErrorResponse } from "./http";
import { appendSetCookieHeaders } from "./http/cookies";
import {
  createInMemoryRateLimitStore,
  createRateLimiter,
} from "./rate-limit";
import { createApiRuntimeServicesFromEnv } from "./runtime/services";
import { createAuthRouter } from "./modules/auth/router";
import { createHealthRouter } from "./modules/health/router";
import { createKnowledgeBasesRouter } from "./modules/knowledge-bases/router";
import { createDocumentsRouter } from "./modules/documents/router";
import { createChatRouter } from "./modules/chat/router";
import { createProvidersRouter } from "./modules/providers/router";
import { createUsersRouter } from "./modules/users/router";
import { createRequestContextMiddleware } from "./middleware";
export { healthResponseSchema } from "./modules/health/types";
export type { HealthResponse } from "./modules/health/types";
import { createInMemoryUploadConcurrencyLimiter } from "./modules/documents/lib/upload-concurrency";

const defaultUploadConfig: UploadConfig = {
  concurrencyPerActor: defaultUploadConcurrencyPerActor,
  concurrencyPerTenant: defaultUploadConcurrencyPerTenant,
  maxFileBytes: defaultUploadMaxFileBytes,
  rateLimitPerMinute: defaultUploadRateLimitPerMinute,
  requestOverheadBytes: defaultUploadRequestOverheadBytes,
};

export function createApiApp(options: ApiAppOptions = {}): ApiApp {
  const app = new Hono<ApiEnv>();
  const logger = options.logger ?? createLogger({ service: "api" });
  const authService = options.authService ?? createUnauthenticatedAuthService();
  const auditService = options.auditService ?? createNoopAuditService();
  const allowedOrigins = options.allowedOrigins ?? ["http://localhost:3000"];
  const rateLimiter =
    options.rateLimiter ??
    createRateLimiter({
      store: createInMemoryRateLimitStore(),
    });
  const userService: UserService = {
    ...createEmptyUserService(),
    ...options.userService,
  };
  const documentService: DocumentService = {
    ...createEmptyDocumentService(),
    ...options.documentService,
  };
  const chatService: ChatService = {
    ...createEmptyChatService(),
    ...options.chatService,
  };
  const knowledgeBaseService: KnowledgeBaseService = {
    ...createEmptyKnowledgeBaseService(),
    ...options.knowledgeBaseService,
  };
  const providerConfigService: ProviderConfigApiService = {
    ...createEmptyProviderConfigService(),
    ...options.providerConfigService,
  };
  const providerTransportKeyService =
    options.providerTransportKeyService ??
    createInMemoryProviderTransportKeyService();
  const uploadConcurrencyLimiter =
    options.uploadConcurrencyLimiter ?? createInMemoryUploadConcurrencyLimiter();
  const uploadConfig = options.uploadConfig ?? defaultUploadConfig;

  app.use("*", createRequestContextMiddleware(logger));

  app.onError((error, context) => {
    const requestId = context.get("requestId") || crypto.randomUUID();
    const requestLogger = context.get("logger") ?? logger.child({ requestId });
    context.header("X-Request-Id", requestId);

    if (isAppError(error)) {
      const appError = error.data;
      if (appError.responseHeaders?.retryAfterSeconds !== undefined) {
        context.header(
          "Retry-After",
          appError.responseHeaders.retryAfterSeconds.toString(),
        );
      }
      appendSetCookieHeaders(context, appError.responseHeaders?.setCookie);

      requestLogger.error("api_request_app_error", {
        code: appError.code,
        httpStatus: appError.httpStatus,
        domain: appError.domain,
        reason: appError.reason,
        retryable: appError.retryable ?? false,
        ...(appError.metadata === undefined
          ? {}
          : { metadata: appError.metadata }),
        error: error.message,
        stack: error.stack ?? "",
      });

      return context.json(
        createErrorResponse({
          code: appError.code,
          httpStatus: appError.httpStatus,
          message: appError.message,
          requestId,
          ...(appError.validationErrors === undefined
            ? {}
            : { validationErrors: appError.validationErrors }),
        }),
        appError.httpStatus,
      );
    }

    requestLogger.error("api_request_unhandled_error", {
      ...createSafeErrorLogFields(error, {
        message: "Unhandled API error.",
      }),
      method: context.req.method,
      path: context.req.path,
    });

    return context.json(
      createErrorResponse({
        code: "INTERNAL_ERROR",
        httpStatus: 500,
        message: "操作失败，请稍后重试。",
        requestId,
      }),
      500,
    );
  });

  app.route("/", createHealthRouter());
  app.route(
    "/",
    createAuthRouter({
      allowedOrigins,
      authService,
      rateLimiter,
    }),
  );

  app.route(
    "/",
    createUsersRouter({
      allowedOrigins,
      auditService,
      authService,
      rateLimiter,
      userService,
    }),
  );
  app.route(
    "/",
    createKnowledgeBasesRouter({
      allowedOrigins,
      auditService,
      authService,
      knowledgeBaseService,
      rateLimiter,
    }),
  );
  app.route(
    "/",
    createDocumentsRouter({
      allowedOrigins,
      auditService,
      authService,
      documentService,
      rateLimiter,
      uploadConcurrencyLimiter,
      uploadConfig,
    }),
  );
  app.route(
    "/",
    createChatRouter({
      allowedOrigins,
      authService,
      chatService,
      rateLimiter,
    }),
  );
  app.route(
    "/",
    createProvidersRouter({
      allowedOrigins,
      auditService,
      authService,
      providerConfigService,
      providerTransportKeyService,
      rateLimiter,
    }),
  );

  return app;
}

export function createDefaultApiApp(
  env: NodeJS.ProcessEnv = process.env,
): Hono<ApiEnv> {
  return createApiApp(createApiRuntimeServicesFromEnv(env));
}
