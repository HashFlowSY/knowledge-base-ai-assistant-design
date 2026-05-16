export const MOCK_STORAGE_KEY = "kbai.frontendMock.v1";
export const MOCK_SCHEMA_VERSION = 1;
export const MOCK_NOW = "2026-05-15T10:00:00.000Z";

export type MockRole = "admin" | "member";
export type MockUserStatus = "active" | "disabled" | "pending";
export type MockKnowledgeBaseStatus = "ready" | "processing" | "failed" | "empty";
export type MockVisibility = "private" | "shared";
export type MockDocumentStatus = "ready" | "processing" | "failed" | "empty";
export type MockSourceType = "file" | "url";
export type MockProcessingStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";
export type MockIngestionStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";
export type MockIngestionStep =
  | "queued"
  | "fetching"
  | "parsing"
  | "chunking"
  | "embedding"
  | "indexing"
  | "completed"
  | "failed";
export type MockLogLevel = "info" | "warning" | "error";
export type MockChatLifecycle =
  | "idle"
  | "retrieving"
  | "generating"
  | "completed"
  | "no_citation"
  | "failed";
export type MockProviderKind = "chat" | "embedding" | "rerank";
export type MockProviderStatus = "enabled" | "disabled" | "testing" | "error";
export type MockActorType = "user" | "system";
export type MockTargetType =
  | "knowledge_base"
  | "document"
  | "ingestion_job"
  | "provider"
  | "user"
  | "chat_message"
  | "session";
export type MockAuditAction =
  | "knowledge_base.create"
  | "document.import"
  | "job.retry"
  | "job.cancel"
  | "chat.feedback.submit"
  | "provider.create"
  | "provider.update"
  | "provider.delete"
  | "provider.enable"
  | "provider.disable"
  | "provider.test_connection"
  | "user.create"
  | "user.update"
  | "user.delete"
  | "user.role_change"
  | "user.enable"
  | "user.disable"
  | "session.expire";
export type MockFeedbackRating = "useful" | "not_useful";

export interface MockUser {
  id: string;
  name: string;
  email: string;
  role: MockRole;
  emailVerified: boolean;
  status: MockUserStatus;
  createdAt: string;
  updatedAt: string;
}

export interface MockSession {
  userId: string | null;
  role: MockRole | null;
  sessionExpired: boolean;
  intendedRedirectTo: string | null;
}

export interface MockKnowledgeBase {
  id: string;
  name: string;
  description: string;
  status: MockKnowledgeBaseStatus;
  owner: string;
  visibility: MockVisibility;
  documentIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface MockDocument {
  id: string;
  knowledgeBaseId: string;
  title: string;
  sourceType: MockSourceType;
  status: MockDocumentStatus;
  version: string;
  sourceId: string;
  chunkIds: string[];
  jobIds: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface MockSource {
  id: string;
  documentId: string;
  sourceType: MockSourceType;
  fileName?: string;
  mimeType?: string;
  sizeLabel?: string;
  objectKey?: string;
  url?: string;
  fetchedTitle?: string;
  fetchedSummary?: string;
  hashSummary: string;
  processingStatus: MockProcessingStatus;
  crawledAt?: string;
}

export interface MockChunk {
  id: string;
  documentId: string;
  index: number;
  tokenEstimate: number;
  locator: string;
  summary: string;
  content: string;
  contentHash: string;
  sanitizedMetadata: string;
}

export interface MockIngestionJob {
  id: string;
  documentId: string;
  knowledgeBaseId: string;
  sourceType: MockSourceType;
  status: MockIngestionStatus;
  currentStep: MockIngestionStep;
  attempts: number;
  maxAttempts: number;
  requestedBy: string;
  queuedAt: string;
  finishedAt: string | null;
  lastError: string | null;
  logIds: string[];
}

export interface MockProcessingLog {
  id: string;
  jobId: string;
  documentId: string;
  knowledgeBaseId: string;
  level: MockLogLevel;
  step: MockIngestionStep;
  message: string;
  errorCode: string | null;
  requestId: string;
  metadataSummary: string;
  createdAt: string;
}

export interface MockChatFeedback {
  rating: MockFeedbackRating;
  reason: string;
  submittedAt: string;
}

export interface MockChatMessage {
  id: string;
  sessionId: string;
  role: "user" | "assistant";
  lifecycle: MockChatLifecycle;
  content: string;
  citationIds: string[];
  feedback: MockChatFeedback | null;
}

export interface MockChatSession {
  id: string;
  knowledgeBaseId: string;
  title: string;
  messages: MockChatMessage[];
  selectedAnswerId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MockCitation {
  id: string;
  answerMessageId: string;
  documentId: string;
  chunkId: string;
  title: string;
  locator: string;
  excerpt: string;
  matchReason: string;
}

export interface MockProviderConfig {
  id: string;
  displayName: string;
  kind: MockProviderKind;
  provider: string;
  modelId: string;
  baseUrl: string;
  status: MockProviderStatus;
  maskedKeySuffix: string;
  keyVersion: number;
  updatedAt: string;
}

export interface MockProviderConfigInput {
  id?: string;
  displayName: string;
  kind: MockProviderKind;
  provider: string;
  modelId: string;
  baseUrl: string;
  apiKey?: string;
  status: Extract<MockProviderStatus, "enabled" | "disabled">;
}

export interface MockAuditEvent {
  id: string;
  actorId: string;
  actorType: MockActorType;
  action: MockAuditAction;
  targetType: MockTargetType;
  targetId: string;
  requestId: string;
  ipSummary: string;
  userAgentSummary: string;
  sanitizedMetadata: string;
  createdAt: string;
}

export interface MockState {
  schemaVersion: 1;
  session: MockSession;
  selectedKnowledgeBaseId: string;
  selectedChatSessionId: string;
  knowledgeBases: MockKnowledgeBase[];
  documents: MockDocument[];
  sources: MockSource[];
  chunks: MockChunk[];
  jobs: MockIngestionJob[];
  logs: MockProcessingLog[];
  chatSessions: MockChatSession[];
  citations: MockCitation[];
  providerConfigs: MockProviderConfig[];
  users: MockUser[];
  auditEvents: MockAuditEvent[];
}

export type RouteAccess =
  | { allowed: true }
  | { allowed: false; redirectTo: string; reason: "login_required" | "already_authenticated" | "forbidden" };

export type ChatAnswerMode = "with_citation" | "retrieving" | "generating" | "no_citation" | "failed";

export type MockAction =
  | {
      type: "login";
      email: string;
      password: string;
      redirectTo: string | null;
    }
  | { type: "logout" }
  | { type: "expireSession"; intendedRedirectTo: string }
  | { type: "switchRole"; role: MockRole }
  | { type: "resetDemoData" }
  | { type: "hydrateState"; state: MockState }
  | { type: "selectKnowledgeBase"; knowledgeBaseId: string }
  | { type: "selectChatSession"; sessionId: string }
  | { type: "createKnowledgeBase"; name: string; description: string }
  | { type: "uploadFile"; knowledgeBaseId: string; fileName: string }
  | { type: "importUrl"; knowledgeBaseId: string; url: string; title?: string }
  | { type: "retryJob"; jobId: string }
  | { type: "cancelJob"; jobId: string }
  | { type: "newChatSession"; knowledgeBaseId: string }
  | {
      type: "submitChatQuestion";
      knowledgeBaseId: string;
      sessionId: string;
      question: string;
      mode: ChatAnswerMode;
    }
  | {
      type: "submitChatFeedback";
      answerMessageId: string;
      rating: MockFeedbackRating;
      reason: string;
    }
  | { type: "saveProviderConfig"; provider: MockProviderConfigInput }
  | { type: "deleteProviderConfig"; providerId: string }
  | { type: "setProviderStatus"; providerId: string; status: "enabled" | "disabled" }
  | { type: "createUser"; name: string; email: string; role: MockRole; status: MockUserStatus }
  | { type: "updateUser"; userId: string; name: string; email: string; role: MockRole; status: MockUserStatus }
  | { type: "deleteUser"; userId: string }
  | { type: "changeUserRole"; userId: string; role: MockRole }
  | { type: "setUserStatus"; userId: string; status: "active" | "disabled" }
  | { type: "disableUser"; userId: string };
