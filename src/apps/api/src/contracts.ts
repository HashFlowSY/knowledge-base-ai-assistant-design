import type { HonoBase } from "hono/hono-base";
import type { Endpoint } from "hono/types";

import type { SessionPayload } from "@kb/auth";
import type {
  ApiErrorResponse,
  ApiSuccessResponse,
  EmptyPayload,
} from "@kb/shared";
import type {
  CreateUserInput,
  UpdateUserInput,
  UsersPage,
  UserSummary,
  listUsersQuerySchema,
} from "@kb/users";

import type { RateLimitConsumeInput } from "./rate-limit";

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
