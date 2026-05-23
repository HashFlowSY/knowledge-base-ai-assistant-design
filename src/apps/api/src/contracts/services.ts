import type { SessionPayload } from "@kb/auth";
import type {
  CreateKnowledgeBaseInput,
  DocumentFileUploadResult,
  KnowledgeBaseDetail,
  KnowledgeBaseListQuery,
  KnowledgeBaseSummary,
  KnowledgeBasesPage,
  UpdateKnowledgeBaseInput,
} from "@kb/knowledge";
import type {
  CreateUserInput,
  UpdateUserInput,
  UsersPage,
  UserSummary,
  listUsersQuerySchema,
} from "@kb/users";

import type { RateLimitConsumeInput } from "../rate-limit";

export type { DocumentFileUploadResult } from "@kb/knowledge";

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

export interface KnowledgeBaseService {
  listKnowledgeBases(input: {
    actor: SessionPayload;
    query: KnowledgeBaseListQuery;
  }): Promise<
    | {
        ok: true;
        page: KnowledgeBasesPage;
      }
    | ApiServiceError
  >;
  getKnowledgeBase(input: {
    actor: SessionPayload;
    knowledgeBaseId: string;
  }): Promise<
    | {
        ok: true;
        knowledgeBase: KnowledgeBaseDetail;
      }
    | ApiServiceError
  >;
  createKnowledgeBase(input: {
    actor: SessionPayload;
    body: CreateKnowledgeBaseInput;
  }): Promise<
    | {
        ok: true;
        knowledgeBase: KnowledgeBaseSummary;
      }
    | ApiServiceError
  >;
  updateKnowledgeBase(input: {
    actor: SessionPayload;
    body: UpdateKnowledgeBaseInput;
    knowledgeBaseId: string;
  }): Promise<
    | {
        ok: true;
        knowledgeBase: KnowledgeBaseDetail;
      }
    | ApiServiceError
  >;
}

export interface DocumentFileUploadServiceInput {
  actor: SessionPayload;
  checksum: string;
  content: Uint8Array;
  ipSummary: string;
  knowledgeBaseId: string;
  mimeType: string;
  originalFilename: string;
  requestId: string;
  sizeBytes: number;
  title: string;
  userAgentSummary: string | null;
}

export interface DocumentService {
  uploadDocumentFile(input: DocumentFileUploadServiceInput): Promise<
    | {
        ok: true;
        result: DocumentFileUploadResult;
      }
    | ApiServiceError
  >;
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
  recordDocumentUploadSecurityFailure(input: {
    actor: SessionPayload;
    ipSummary: string;
    knowledgeBaseId: string;
    metadata: Record<string, unknown>;
    reason:
      | "oversized_file"
      | "spoofed_file_signature"
      | "unsupported_file_type";
    requestId: string;
    userAgentSummary: string | null;
  }): Promise<void>;
}

export interface UploadConfig {
  concurrencyPerActor: number;
  concurrencyPerTenant: number;
  maxFileBytes: number;
  rateLimitPerMinute: number;
  requestOverheadBytes: number;
}

export interface UploadConcurrencyReservation {
  release(): void;
}

export interface UploadConcurrencyLimiter {
  acquire(input: {
    actorKey: string;
    actorLimit: number;
    tenantKey: string;
    tenantLimit: number;
  }):
    | {
        ok: true;
        reservation: UploadConcurrencyReservation;
      }
    | {
        ok: false;
        scope: "actor" | "tenant";
      };
}

export interface ApiAppOptions {
  allowedOrigins?: string[];
  auditService?: AuditService;
  authService?: AuthService;
  documentService?: Partial<DocumentService>;
  knowledgeBaseService?: Partial<KnowledgeBaseService>;
  rateLimiter?: ApiRateLimiter;
  uploadConcurrencyLimiter?: UploadConcurrencyLimiter;
  uploadConfig?: UploadConfig;
  userService?: Partial<UserService>;
}

export interface ApiRuntimeResource {
  close(): Promise<void>;
}
