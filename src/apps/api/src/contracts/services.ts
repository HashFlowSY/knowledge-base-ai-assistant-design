import type { SessionPayload } from "@kb/auth";
import type {
  CreateUserInput,
  UpdateUserInput,
  UsersPage,
  UserSummary,
  listUsersQuerySchema,
} from "@kb/users";

import type { RateLimitConsumeInput } from "../rate-limit";

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
