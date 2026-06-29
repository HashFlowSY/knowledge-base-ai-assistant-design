import type { SessionPayload } from "@kb/auth";
import type { Logger } from "@kb/observability";
import type {
  ModelServiceKind,
  ProviderListResponse,
  ProviderPublicKey,
  ProviderStatus,
  ProviderSummary,
} from "@kb/ai-providers";
import type {
  CreateKnowledgeBaseInput,
  DocumentFileUploadResult,
  DocumentProcessingListQuery,
  DocumentProcessingPage,
  KnowledgeActor,
  KnowledgeBaseDetail,
  KnowledgeBaseListQuery,
  KnowledgeBaseSummary,
  KnowledgeBasesPage,
  RetryDocumentProcessingResult,
  UpdateKnowledgeBaseInput,
} from "@kb/knowledge";
import type {
  ChatMessagesResponse,
  ChatSessionsResponse,
  ChatStreamEvent,
  ChatSubmitResponse,
  CreateChatSessionInput,
  SubmitAnswerFeedbackInput,
  SubmitAnswerFeedbackResponse,
  SubmitChatQuestionInput,
} from "@kb/rag";
import type {
  CreateUserInput,
  UpdateUserInput,
  UsersPage,
  UserSummary,
  listUsersQuerySchema,
} from "@kb/users";

import type { RateLimitConsumeInput } from "../rate-limit";

export type {
  DocumentFileUploadResult,
  DocumentProcessingListQuery,
  DocumentProcessingPage,
  DocumentProcessingSummary,
  RetryDocumentProcessingResult,
} from "@kb/knowledge";

export interface ProviderConfigApiServiceSaveBody {
  displayName: string;
  provider: string;
  modelId: string;
  baseUrl: string;
  status: ProviderStatus;
  apiKey: { mode: "keep" } | { mode: "plaintext"; value: string };
}

export interface AuthService {
  login(input: { email: string; password: string }): Promise<{
    ok: true;
    payload: SessionPayload;
    setCookieHeaders?: string[];
  }>;
  logout(input: {
    cookieHeader: string | null;
  }): Promise<{ ok: true; setCookieHeaders?: string[] }>;
  getSession(input: { cookieHeader: string | null }): Promise<{
    ok: true;
    payload: SessionPayload;
  }>;
}

export interface UserService {
  listUsers(input: {
    actor: SessionPayload;
    query: ReturnType<typeof listUsersQuerySchema.parse>;
  }): Promise<{
    ok: true;
    page: UsersPage;
  }>;
  createUser(input: { actor: SessionPayload; body: CreateUserInput }): Promise<
    {
      ok: true;
      user: UserSummary;
    }
  >;
  getUser(input: { actor: SessionPayload; userId: string }): Promise<
    {
      ok: true;
      user: UserSummary;
    }
  >;
  updateUser(input: {
    actor: SessionPayload;
    body: UpdateUserInput;
    userId: string;
  }): Promise<
    {
      ok: true;
      user: UserSummary;
    }
  >;
  removeUserAccess(input: {
    actor: SessionPayload;
    userId: string;
  }): Promise<{ ok: true }>;
}

export interface KnowledgeBaseService {
  listKnowledgeBases(input: {
    actor: KnowledgeActor;
    query: KnowledgeBaseListQuery;
  }): Promise<{
    ok: true;
    page: KnowledgeBasesPage;
  }>;
  getKnowledgeBase(input: { actor: KnowledgeActor; knowledgeBaseId: string }): Promise<
    {
      ok: true;
      knowledgeBase: KnowledgeBaseDetail;
    }
  >;
  createKnowledgeBase(input: {
    actor: KnowledgeActor;
    body: CreateKnowledgeBaseInput;
  }): Promise<
    {
      ok: true;
      knowledgeBase: KnowledgeBaseSummary;
    }
  >;
  updateKnowledgeBase(input: {
    actor: KnowledgeActor;
    body: UpdateKnowledgeBaseInput;
    knowledgeBaseId: string;
  }): Promise<
    {
      ok: true;
      knowledgeBase: KnowledgeBaseDetail;
    }
  >;
}

export interface DocumentFileUploadServiceInput {
  actor: KnowledgeActor;
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
  listDocumentProcessing(input: {
    actor: KnowledgeActor;
    knowledgeBaseId: string;
    query: DocumentProcessingListQuery;
  }): Promise<{
    ok: true;
    page: DocumentProcessingPage;
  }>;
  uploadDocumentFile(input: DocumentFileUploadServiceInput): Promise<
    {
      ok: true;
      result: DocumentFileUploadResult;
    }
  >;
  retryDocumentProcessing(input: {
    actor: KnowledgeActor;
    documentId: string;
    knowledgeBaseId: string;
  }): Promise<
    {
      ok: true;
      result: RetryDocumentProcessingResult;
    }
  >;
}

export interface ProviderConfigApiService {
  listProviderConfigs(input: { actor: SessionPayload }): Promise<{
    ok: true;
    providers: ProviderListResponse["providers"];
  }>;
  saveProviderConfig(input: {
    actor: SessionPayload;
    body: ProviderConfigApiServiceSaveBody;
    ipSummary: string | null;
    kind: ModelServiceKind;
    requestId: string;
    userAgentSummary: string | null;
  }): Promise<{
    ok: true;
    provider: ProviderSummary;
  }>;
}

export interface ChatService {
  listSessions(input: {
    actor: SessionPayload;
    query: { knowledgeBaseId?: string };
  }): Promise<{ ok: true; result: ChatSessionsResponse }>;
  createSession(input: {
    actor: SessionPayload;
    body: CreateChatSessionInput;
  }): Promise<{ ok: true; result: { session: ChatSessionsResponse["sessions"][number] } }>;
  listMessages(input: {
    actor: SessionPayload;
    sessionId: string;
  }): Promise<{ ok: true; result: ChatMessagesResponse }>;
  submitQuestion(input: {
    actor: SessionPayload;
    body: SubmitChatQuestionInput;
    requestId: string;
  }): Promise<{ ok: true; result: ChatSubmitResponse }>;
  streamQuestion(input: {
    actor: SessionPayload;
    body: SubmitChatQuestionInput;
    requestId: string;
    signal?: AbortSignal;
  }): AsyncIterable<ChatStreamEvent>;
  submitFeedback(input: {
    actor: SessionPayload;
    body: SubmitAnswerFeedbackInput;
    messageId: string;
  }): Promise<{ ok: true; result: SubmitAnswerFeedbackResponse }>;
}

export interface ProviderTransportKeyService {
  createPublicKey(): Promise<ProviderPublicKey>;
  decryptApiKey(input: {
    ciphertext: string;
    keyId: string;
  }): Promise<{ ok: true; plaintext: string }>;
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
    reason: "oversized_file" | "spoofed_file_signature" | "unsupported_file_type";
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
  chatService?: Partial<ChatService>;
  documentService?: Partial<DocumentService>;
  knowledgeBaseService?: Partial<KnowledgeBaseService>;
  logger?: Logger;
  providerConfigService?: Partial<ProviderConfigApiService>;
  providerTransportKeyService?: ProviderTransportKeyService;
  rateLimiter?: ApiRateLimiter;
  uploadConcurrencyLimiter?: UploadConcurrencyLimiter;
  uploadConfig?: UploadConfig;
  userService?: Partial<UserService>;
}

export interface ApiRuntimeResource {
  close(): Promise<void>;
}
