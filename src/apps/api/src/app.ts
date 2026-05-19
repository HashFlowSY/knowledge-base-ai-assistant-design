import { Hono, type Context } from "hono";
import type { HonoBase } from "hono/hono-base";
import type { Endpoint } from "hono/types";
import { z } from "zod";

import { loginInputSchema, type SessionPayload } from "@kb/auth";
import { createLogger } from "@kb/observability";
import {
  type ApiErrorResponse,
  type ApiSuccessResponse,
  type EmptyPayload,
  createUtcTimestamp,
} from "@kb/shared";
import {
  createUserInputSchema,
  listUsersQuerySchema,
  updateUserInputSchema,
  type CreateUserInput,
  type UpdateUserInput,
  type UsersPage,
  type UserSummary,
} from "@kb/users";

import {
  createSuccessResponse,
  hasRequestBody,
  readJsonBody,
  respondWithError,
} from "./http";
import {
  createInMemoryRateLimitStore,
  createRateLimitIdentity,
  createRateLimiter,
  createSessionRateLimitIdentity,
  type RateLimitConsumeInput,
} from "./rate-limit";
import { createApiRuntimeServicesFromEnv } from "./runtime-services";

export interface ApiContextVariables {
  requestId: string;
}

export interface ApiEnv {
  Variables: ApiContextVariables;
}

export interface ApiServiceError {
  ok: false;
  code: string;
  httpStatus: 400 | 401 | 403 | 404 | 409 | 429 | 500;
  message: string;
  setCookieHeaders?: string[];
}

export interface AuthService {
  login(input: { email: string; password: string }): Promise<
    | {
        ok: true;
        payload: SessionPayload;
        setCookieHeaders?: string[];
      }
    | ApiServiceError
  >;
  logout(input: {
    cookieHeader: string | null;
  }): Promise<{ ok: true; setCookieHeaders?: string[] } | ApiServiceError>;
  getSession(input: { cookieHeader: string | null }): Promise<
    | {
        ok: true;
        payload: SessionPayload;
      }
    | ApiServiceError
  >;
}

export interface UserService {
  listUsers(input: {
    actor: SessionPayload;
    query: ReturnType<typeof listUsersQuerySchema.parse>;
  }): Promise<
    | {
        ok: true;
        page: UsersPage;
      }
    | ApiServiceError
  >;
  createUser(input: {
    actor: SessionPayload;
    body: CreateUserInput;
  }): Promise<
    | {
        ok: true;
        user: UserSummary;
      }
    | ApiServiceError
  >;
  getUser(input: {
    actor: SessionPayload;
    userId: string;
  }): Promise<
    | {
        ok: true;
        user: UserSummary;
      }
    | ApiServiceError
  >;
  updateUser(input: {
    actor: SessionPayload;
    body: UpdateUserInput;
    userId: string;
  }): Promise<
    | {
        ok: true;
        user: UserSummary;
      }
    | ApiServiceError
  >;
  removeUserAccess(input: {
    actor: SessionPayload;
    userId: string;
  }): Promise<{ ok: true } | ApiServiceError>;
}

export interface ApiRateLimiter {
  consume(input: RateLimitConsumeInput): Promise<{
    allowed: boolean;
    retryAfterSeconds: number;
  }>;
}

export interface AuditService {
  recordForbiddenAdminAttempt(input: {
    action: "auth.forbidden";
    actor: SessionPayload;
    ipSummary: string;
    method: string;
    path: string;
    requestId: string;
    targetId: string;
    targetType: "api_route";
    userAgentSummary: string | null;
  }): Promise<void>;
}

export interface ApiAppOptions {
  allowedOrigins?: string[];
  auditService?: AuditService;
  authService?: AuthService;
  rateLimiter?: ApiRateLimiter;
  userService?: Partial<UserService>;
}

export interface ApiRuntimeResource {
  close(): Promise<void>;
}

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("api"),
  timestamp: z.string().datetime(),
  requestId: z.string().min(1),
  dependencies: z.object({
    config: z.literal("not_checked"),
    database: z.literal("not_checked"),
    redis: z.literal("not_checked"),
    meilisearch: z.literal("not_checked"),
    objectStorage: z.literal("not_checked"),
  }),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

type JsonEndpoint<Input, Output, Status extends number> = Endpoint & {
  input: Input;
  output: Output;
  outputFormat: "json";
  status: Status;
};

// Hono RPC schema must stay a type alias so literal route keys are preserved.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
type ApiRouteSchema = {
  "/api/auth/login": {
    $post: JsonEndpoint<
      { json: { email: string; password: string } },
      ApiSuccessResponse<SessionPayload> | ApiErrorResponse,
      200 | 400 | 401 | 403 | 429 | 500
    >;
  };
  "/api/auth/logout": {
    $post: JsonEndpoint<
      Record<string, never>,
      ApiSuccessResponse<EmptyPayload> | ApiErrorResponse,
      200 | 400 | 401 | 403 | 429 | 500
    >;
  };
  "/api/auth/session": {
    $get: JsonEndpoint<
      Record<string, never>,
      ApiSuccessResponse<SessionPayload> | ApiErrorResponse,
      200 | 401 | 403 | 429 | 500
    >;
  };
  "/api/users": {
    $get: JsonEndpoint<
      {
        query?: {
          filter?: string;
          page?: string;
          pageSize?: string;
          search?: string;
          sort?: string;
        };
      },
      ApiSuccessResponse<UsersPage> | ApiErrorResponse,
      200 | 401 | 403 | 429 | 500
    >;
    $post: JsonEndpoint<
      { json: CreateUserInput },
      ApiSuccessResponse<UserSummary> | ApiErrorResponse,
      201 | 400 | 401 | 403 | 409 | 429 | 500
    >;
  };
  "/api/users/:userId": {
    $get: JsonEndpoint<
      { param: { userId: string } },
      ApiSuccessResponse<UserSummary> | ApiErrorResponse,
      200 | 401 | 403 | 404 | 429 | 500
    >;
    $patch: JsonEndpoint<
      { json: UpdateUserInput; param: { userId: string } },
      ApiSuccessResponse<UserSummary> | ApiErrorResponse,
      200 | 400 | 401 | 403 | 404 | 409 | 429 | 500
    >;
  };
  "/api/users/:userId/access": {
    $delete: JsonEndpoint<
      { param: { userId: string } },
      ApiSuccessResponse<EmptyPayload> | ApiErrorResponse,
      200 | 400 | 401 | 403 | 404 | 429 | 500
    >;
  };
};

export type ApiApp = HonoBase<ApiEnv, ApiRouteSchema, "/">;

export function createApiApp(options: ApiAppOptions = {}) {
  const app = new Hono<ApiEnv>();
  const logger = createLogger({ service: "api" });
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

  app.use("*", async (context, next) => {
    const existingRequestId = context.req.header("x-request-id");
    const requestId =
      existingRequestId && existingRequestId.length > 0
        ? existingRequestId
        : crypto.randomUUID();

    context.set("requestId", requestId);
    context.header("X-Request-Id", requestId);

    await next();

    logger.info("api_request_finished", {
      requestId,
      method: context.req.method,
      path: context.req.path,
      status: context.res.status,
    });
  });

  app.get("/health", (context) => {
    const response = healthResponseSchema.parse({
      status: "ok",
      service: "api",
      timestamp: createUtcTimestamp(),
      requestId: context.get("requestId"),
      dependencies: {
        config: "not_checked",
        database: "not_checked",
        redis: "not_checked",
        meilisearch: "not_checked",
        objectStorage: "not_checked",
      },
    });

    return context.json(response);
  });

  app.post("/api/auth/login", async (context) => {
    const csrfResponse = validateJsonMutationRequest(context, allowedOrigins);
    if (csrfResponse !== null) {
      const rateLimitResponse = await rateLimitLogin(context, rateLimiter, null);
      return rateLimitResponse ?? csrfResponse;
    }

    const body = await readJsonBody(context.req.raw);
    const rateLimitResponse = await rateLimitLogin(
      context,
      rateLimiter,
      getLoginRateLimitEmail(body),
    );
    if (rateLimitResponse !== null) {
      return rateLimitResponse;
    }

    const parsed = loginInputSchema.safeParse(body);
    if (!parsed.success) {
      return respondWithError(context, {
        code: "VALIDATION_ERROR",
        httpStatus: 400,
        message: "请检查填写内容。",
        validationErrors: parsed.error.issues.map((issue) => ({
          path: issue.path,
          message: issue.message,
        })),
      });
    }

    const result = await authService.login(parsed.data);
    if (!result.ok) {
      appendSetCookieHeaders(context, result.setCookieHeaders);
      return respondWithError(context, {
        code: result.code,
        httpStatus: result.httpStatus,
        message: result.message,
      });
    }

    appendSetCookieHeaders(context, result.setCookieHeaders);

    return context.json(
      createSuccessResponse({
        data: result.payload,
        httpStatus: 200,
        requestId: context.get("requestId"),
      }),
      200,
    );
  });

  app.post("/api/auth/logout", async (context) => {
    const csrfResponse = validateMutationRequest(context, allowedOrigins);
    if (csrfResponse !== null) {
      const rateLimitResponse = await rateLimitAuthSession(context, rateLimiter);
      return rateLimitResponse ?? csrfResponse;
    }

    if (hasRequestBody(context.req.raw)) {
      const rateLimitResponse = await rateLimitAuthSession(context, rateLimiter);
      if (rateLimitResponse !== null) {
        return rateLimitResponse;
      }

      return respondWithError(context, {
        code: "VALIDATION_ERROR",
        httpStatus: 400,
        message: "请检查填写内容。",
      });
    }
    const rateLimitResponse = await rateLimitAuthSession(context, rateLimiter);
    if (rateLimitResponse !== null) {
      return rateLimitResponse;
    }

    const result = await authService.logout({
      cookieHeader: context.req.header("cookie") ?? null,
    });
    if (!result.ok) {
      appendSetCookieHeaders(context, result.setCookieHeaders);
      return respondWithError(context, {
        code: result.code,
        httpStatus: result.httpStatus,
        message: result.message,
      });
    }
    appendSetCookieHeaders(context, result.setCookieHeaders);

    return context.json(
      createSuccessResponse({
        data: null,
        httpStatus: 200,
        requestId: context.get("requestId"),
      }),
      200,
    );
  });

  app.get("/api/auth/session", async (context) => {
    const rateLimitResponse = await rateLimitAuthSession(context, rateLimiter);
    if (rateLimitResponse !== null) {
      return rateLimitResponse;
    }

    const result = await authService.getSession({
      cookieHeader: context.req.header("cookie") ?? null,
    });
    if (!result.ok) {
      appendSetCookieHeaders(context, result.setCookieHeaders);
      return respondWithError(context, {
        code: result.code,
        httpStatus: result.httpStatus,
        message: result.message,
      });
    }

    return context.json(
      createSuccessResponse({
        data: result.payload,
        httpStatus: 200,
        requestId: context.get("requestId"),
      }),
      200,
    );
  });

  app.get("/api/users", async (context) => {
    const authResult = await requireAdminUserManagementSession(
      context,
      auditService,
      authService,
      rateLimiter,
    );
    if (!authResult.ok) {
      return authResult.response;
    }

    const query = listUsersQuerySchema.parse(
      Object.fromEntries(new URL(context.req.url).searchParams),
    );
    const result = await userService.listUsers({
      actor: authResult.actor,
      query,
    });
    if (!result.ok) {
      return respondWithError(context, {
        code: result.code,
        httpStatus: result.httpStatus,
        message: result.message,
      });
    }

    return context.json(
      createSuccessResponse({
        data: result.page,
        httpStatus: 200,
        requestId: context.get("requestId"),
      }),
      200,
    );
  });

  app.post("/api/users", async (context) => {
    const csrfResponse = validateJsonMutationRequest(context, allowedOrigins);
    if (csrfResponse !== null) {
      return respondAfterUnresolvedUserManagementRateLimit(
        context,
        rateLimiter,
        csrfResponse,
      );
    }

    const authResult = await requireAdminUserManagementSession(
      context,
      auditService,
      authService,
      rateLimiter,
    );
    if (!authResult.ok) {
      return authResult.response;
    }

    const body = await readJsonBody(context.req.raw);
    const parsed = createUserInputSchema.safeParse(body);
    if (!parsed.success) {
      return respondWithValidationError(context, parsed.error);
    }

    const result = await userService.createUser({
      actor: authResult.actor,
      body: parsed.data,
    });
    if (!result.ok) {
      return respondWithServiceError(context, result);
    }

    return context.json(
      createSuccessResponse({
        data: result.user,
        httpStatus: 201,
        requestId: context.get("requestId"),
      }),
      201,
    );
  });

  app.get("/api/users/:userId", async (context) => {
    const authResult = await requireAdminUserManagementSession(
      context,
      auditService,
      authService,
      rateLimiter,
    );
    if (!authResult.ok) {
      return authResult.response;
    }

    const result = await userService.getUser({
      actor: authResult.actor,
      userId: context.req.param("userId"),
    });
    if (!result.ok) {
      return respondWithServiceError(context, result);
    }

    return context.json(
      createSuccessResponse({
        data: result.user,
        httpStatus: 200,
        requestId: context.get("requestId"),
      }),
      200,
    );
  });

  app.patch("/api/users/:userId", async (context) => {
    const csrfResponse = validateJsonMutationRequest(context, allowedOrigins);
    if (csrfResponse !== null) {
      return respondAfterUnresolvedUserManagementRateLimit(
        context,
        rateLimiter,
        csrfResponse,
      );
    }

    const authResult = await requireAdminUserManagementSession(
      context,
      auditService,
      authService,
      rateLimiter,
    );
    if (!authResult.ok) {
      return authResult.response;
    }

    const body = await readJsonBody(context.req.raw);
    const parsed = updateUserInputSchema.safeParse(body);
    if (!parsed.success) {
      return respondWithValidationError(context, parsed.error);
    }

    const result = await userService.updateUser({
      actor: authResult.actor,
      body: parsed.data,
      userId: context.req.param("userId"),
    });
    if (!result.ok) {
      return respondWithServiceError(context, result);
    }

    return context.json(
      createSuccessResponse({
        data: result.user,
        httpStatus: 200,
        requestId: context.get("requestId"),
      }),
      200,
    );
  });

  app.delete("/api/users/:userId/access", async (context) => {
    const csrfResponse = validateMutationRequest(context, allowedOrigins);
    if (csrfResponse !== null) {
      return respondAfterUnresolvedUserManagementRateLimit(
        context,
        rateLimiter,
        csrfResponse,
      );
    }

    if (hasRequestBody(context.req.raw)) {
      return respondAfterUnresolvedUserManagementRateLimit(
        context,
        rateLimiter,
        respondWithError(context, {
          code: "VALIDATION_ERROR",
          httpStatus: 400,
          message: "请检查填写内容。",
        }),
      );
    }

    const authResult = await requireAdminUserManagementSession(
      context,
      auditService,
      authService,
      rateLimiter,
    );
    if (!authResult.ok) {
      return authResult.response;
    }

    const result = await userService.removeUserAccess({
      actor: authResult.actor,
      userId: context.req.param("userId"),
    });
    if (!result.ok) {
      return respondWithServiceError(context, result);
    }

    return context.json(
      createSuccessResponse({
        data: null,
        httpStatus: 200,
        requestId: context.get("requestId"),
      }),
      200,
    );
  });

  return app;
}

export function createDefaultApiApp(
  env: NodeJS.ProcessEnv = process.env,
): Hono<ApiEnv> {
  return createApiApp(createApiRuntimeServicesFromEnv(env));
}


function appendSetCookieHeaders(
  context: Context<ApiEnv>,
  setCookieHeaders: string[] | undefined,
): void {
  for (const setCookie of setCookieHeaders ?? []) {
    context.header("Set-Cookie", setCookie, { append: true });
  }
}

function createUnauthenticatedAuthService(): AuthService {
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

function createNoopAuditService(): AuditService {
  return {
    async recordForbiddenAdminAttempt() {
      return undefined;
    },
  };
}

function createEmptyUserService(): UserService {
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

function createNotImplementedServiceError(): ApiServiceError {
  return {
    ok: false,
    code: "INTERNAL_ERROR",
    httpStatus: 500,
    message: "操作失败，请稍后重试。",
  };
}

async function requireAdminUserManagementSession(
  context: Context<ApiEnv>,
  auditService: AuditService,
  authService: AuthService,
  rateLimiter: ApiRateLimiter,
): Promise<{ ok: true; actor: SessionPayload } | { ok: false; response: Response }> {
  const sessionResult = await authService.getSession({
    cookieHeader: context.req.header("cookie") ?? null,
  });
  if (!sessionResult.ok) {
    appendSetCookieHeaders(context, sessionResult.setCookieHeaders);
    const rateLimitResponse = await rateLimitUnresolvedUserManagement(
      context,
      rateLimiter,
    );
    if (rateLimitResponse !== null) {
      return {
        ok: false,
        response: rateLimitResponse,
      };
    }

    return {
      ok: false,
      response: respondWithError(context, {
        code: sessionResult.code,
        httpStatus: sessionResult.httpStatus,
        message: sessionResult.message,
      }),
    };
  }

  const rateLimitResponse = await rateLimitUserManagement(
    context,
    rateLimiter,
    sessionResult.payload,
  );
  if (rateLimitResponse !== null) {
    return {
      ok: false,
      response: rateLimitResponse,
    };
  }

  if (sessionResult.payload.role !== "admin") {
    try {
      await auditService.recordForbiddenAdminAttempt({
        action: "auth.forbidden",
        actor: sessionResult.payload,
        ipSummary: getIpSummary(context),
        method: context.req.method,
        path: context.req.path,
        requestId: context.get("requestId"),
        targetId: context.req.path,
        targetType: "api_route",
        userAgentSummary: context.req.header("user-agent") ?? null,
      });
    } catch (error) {
      createLogger({ service: "api" }).error("auth_forbidden_audit_failed", {
        error: error instanceof Error ? error.message : String(error),
        requestId: context.get("requestId"),
      });
      return {
        ok: false,
        response: respondWithError(context, {
          code: "INTERNAL_ERROR",
          httpStatus: 500,
          message: "操作失败，请稍后重试。",
        }),
      };
    }

    return {
      ok: false,
      response: respondWithError(context, {
        code: "FORBIDDEN",
        httpStatus: 403,
        message: "你没有权限执行此操作。",
      }),
    };
  }

  return {
    ok: true,
    actor: sessionResult.payload,
  };
}

async function respondAfterUnresolvedUserManagementRateLimit(
  context: Context<ApiEnv>,
  rateLimiter: ApiRateLimiter,
  fallbackResponse: Response,
): Promise<Response> {
  const rateLimitResponse = await rateLimitUnresolvedUserManagement(context, rateLimiter);
  return rateLimitResponse ?? fallbackResponse;
}

async function rateLimitUserManagement(
  context: Context<ApiEnv>,
  rateLimiter: ApiRateLimiter,
  actor: SessionPayload,
): Promise<Response | null> {
  const identity = await createRateLimitIdentity({
    kind: "actor",
    actorId: actor.user.id,
    tenantId: actor.tenant.id,
  });

  return consumeRateLimit(context, rateLimiter, {
    identity,
    limit: 120,
    scope: "user-management",
    windowLabel: "1m",
    windowMs: 60_000,
  });
}

async function rateLimitUnresolvedUserManagement(
  context: Context<ApiEnv>,
  rateLimiter: ApiRateLimiter,
): Promise<Response | null> {
  const identity = await createRateLimitIdentity({
    kind: "ip",
    ipSummary: getIpSummary(context),
  });

  return consumeRateLimit(context, rateLimiter, {
    identity,
    limit: 60,
    scope: "user-management",
    windowLabel: "1m",
    windowMs: 60_000,
  });
}

async function rateLimitLogin(
  context: Context<ApiEnv>,
  rateLimiter: ApiRateLimiter,
  email: string | null,
): Promise<Response | null> {
  const identity = await createRateLimitIdentity({
    kind: "login",
    email,
    ipSummary: getIpSummary(context),
  });

  return consumeRateLimit(context, rateLimiter, {
    identity,
    limit: 30,
    scope: "auth",
    windowLabel: "15m",
    windowMs: 15 * 60_000,
  });
}

function getLoginRateLimitEmail(body: unknown): string | null {
  if (typeof body !== "object" || body === null || !("email" in body)) {
    return null;
  }

  const email = body.email;
  return typeof email === "string" ? email : null;
}

async function rateLimitAuthSession(
  context: Context<ApiEnv>,
  rateLimiter: ApiRateLimiter,
): Promise<Response | null> {
  const identity = await createSessionRateLimitIdentity({
    cookieHeader: context.req.header("cookie") ?? null,
    ipSummary: getIpSummary(context),
  });

  return consumeRateLimit(context, rateLimiter, {
    identity,
    limit: 120,
    scope: "auth",
    windowLabel: "1m",
    windowMs: 60_000,
  });
}

async function consumeRateLimit(
  context: Context<ApiEnv>,
  rateLimiter: ApiRateLimiter,
  input: RateLimitConsumeInput,
): Promise<Response | null> {
  const result = await rateLimiter.consume(input);

  if (result.allowed) {
    return null;
  }

  context.header("Retry-After", result.retryAfterSeconds.toString());
  return respondWithError(context, {
    code: "RATE_LIMITED",
    httpStatus: 429,
    message: "请求过于频繁，请稍后重试。",
  });
}

function getIpSummary(context: Context<ApiEnv>): string {
  const forwardedFor = context.req.header("x-forwarded-for");
  const firstForwardedIp = forwardedFor?.split(",")[0]?.trim();

  return firstForwardedIp && firstForwardedIp.length > 0 ? firstForwardedIp : "127.0.0.1";
}

function respondWithServiceError(
  context: Context<ApiEnv>,
  error: ApiServiceError,
): Response {
  return respondWithError(context, {
    code: error.code,
    httpStatus: error.httpStatus,
    message: error.message,
  });
}

function respondWithValidationError(
  context: Context<ApiEnv>,
  error: z.ZodError,
): Response {
  return respondWithError(context, {
    code: "VALIDATION_ERROR",
    httpStatus: 400,
    message: "请检查填写内容。",
    validationErrors: error.issues.map((issue) => ({
      path: issue.path,
      message: issue.message,
    })),
  });
}

function validateMutationRequest(
  context: Context<ApiEnv>,
  allowedOrigins: string[],
): Response | null {
  const origin = context.req.header("origin");
  if (origin === undefined || !allowedOrigins.includes(origin)) {
    return respondWithError(context, {
      code: "FORBIDDEN",
      httpStatus: 403,
      message: "你没有权限执行此操作。",
    });
  }

  const secFetchSite = context.req.header("sec-fetch-site");
  if (
    secFetchSite !== undefined &&
    secFetchSite !== "same-origin" &&
    secFetchSite !== "same-site"
  ) {
    return respondWithError(context, {
      code: "FORBIDDEN",
      httpStatus: 403,
      message: "你没有权限执行此操作。",
    });
  }

  return null;
}

function validateJsonMutationRequest(
  context: Context<ApiEnv>,
  allowedOrigins: string[],
): Response | null {
  const mutationResponse = validateMutationRequest(context, allowedOrigins);
  if (mutationResponse !== null) {
    return mutationResponse;
  }

  const contentType = context.req.header("content-type");
  if (contentType === undefined || !contentType.toLowerCase().includes("application/json")) {
    return respondWithError(context, {
      code: "UNSUPPORTED_MEDIA_TYPE",
      httpStatus: 415,
      message: "请使用 application/json 请求体。",
    });
  }

  return null;
}
