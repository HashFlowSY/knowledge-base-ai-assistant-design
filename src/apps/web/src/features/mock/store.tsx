"use client";

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
  type Dispatch,
  type ReactNode,
} from "react";

import { createSeedMockState as createSeed } from "./seed";
import {
  MOCK_NOW,
  MOCK_STORAGE_KEY,
  type ChatAnswerMode,
  type MockAction,
  type MockAuditAction,
  type MockAuditEvent,
  type MockChatMessage,
  type MockChatSession,
  type MockCitation,
  type MockDocument,
  type MockIngestionJob,
  type MockKnowledgeBase,
  type MockLogLevel,
  type MockProcessingLog,
  type MockProviderConfig,
  type MockProviderConfigInput,
  type MockProviderKind,
  type MockRole,
  type MockSource,
  type MockState,
  type MockTargetType,
  type MockUserStatus,
  type MockUser,
  type RouteAccess,
} from "./types";

export { createSeedMockState } from "./seed";
export { MOCK_STORAGE_KEY } from "./types";

const RECOVERY_NOTICE = "演示数据已恢复为初始状态。";
const MEMBER_OPERATION_ROUTES = ["/tasks"] as const;
const ADMIN_ROUTES = ["/logs", "/providers", "/users", "/audit"] as const;
const PROTECTED_ROUTES = [
  "/workspace",
  "/documents",
  "/chat",
  ...MEMBER_OPERATION_ROUTES,
  ...ADMIN_ROUTES,
] as const;

interface HydrateResult {
  state: MockState;
  notice: string | null;
}

interface MockStoreContextValue {
  state: MockState;
  dispatch: Dispatch<MockAction>;
  hydrated: boolean;
  notice: string | null;
  dismissNotice: () => void;
}

const MockStoreContext = createContext<MockStoreContextValue | null>(null);

export function MockStoreProvider({ children }: { children: ReactNode }): ReactNode {
  const initialState = useMemo(() => createSeed(), []);
  const [state, dispatch] = useReducer(mockStoreReducer, initialState);
  const [hydrated, setHydrated] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const result = hydrateMockState(window.localStorage.getItem(MOCK_STORAGE_KEY));
    dispatch({ state: result.state, type: "hydrateState" });
    setNotice(result.notice);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    window.localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(state));
  }, [hydrated, state]);

  const dismissNotice = useCallback(() => {
    setNotice(null);
  }, []);

  const value = useMemo(
    () => ({ state, dispatch, hydrated, notice, dismissNotice }),
    [dismissNotice, hydrated, notice, state],
  );

  return createElement(MockStoreContext.Provider, { value }, children);
}

export function useMockStore(): MockStoreContextValue {
  const context = useContext(MockStoreContext);
  if (context === null) {
    throw new Error("useMockStore must be used within MockStoreProvider");
  }

  return context;
}

export function hydrateMockState(rawValue: string | null): HydrateResult {
  if (rawValue === null) {
    return { state: createSeed(), notice: null };
  }

  try {
    const parsed: unknown = JSON.parse(rawValue);
    if (isMockState(parsed)) {
      return { state: parsed, notice: null };
    }
  } catch {
    return { state: createSeed(), notice: RECOVERY_NOTICE };
  }

  return { state: createSeed(), notice: RECOVERY_NOTICE };
}

export function isInternalRedirect(value: string | null): value is string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//");
}

export function sanitizeRedirectTo(value: string | null): string {
  if (isInternalRedirect(value)) {
    return value;
  }

  return "/workspace";
}

export function getRouteAccess(session: MockState["session"], path: string): RouteAccess {
  const normalizedPath = normalizeRoutePath(path);

  if (normalizedPath === "/") {
    return { allowed: false, redirectTo: "/workspace", reason: "login_required" };
  }

  const hasSession = session.userId !== null && session.role !== null && !session.sessionExpired;

  if (normalizedPath === "/login") {
    if (!hasSession) {
      return { allowed: true };
    }

    return {
      allowed: false,
      redirectTo: sanitizeRedirectTo(session.intendedRedirectTo),
      reason: "already_authenticated",
    };
  }

  const isProtected = PROTECTED_ROUTES.some(
    (route) => normalizedPath === route || normalizedPath.startsWith(`${route}/`),
  );
  if (isProtected && !hasSession) {
    const expiredSuffix = session.sessionExpired ? "&sessionExpired=1" : "";
    return {
      allowed: false,
      redirectTo: `/login?redirectTo=${encodeURIComponent(normalizedPath)}${expiredSuffix}`,
      reason: "login_required",
    };
  }

  const isAdminRoute = ADMIN_ROUTES.some(
    (route) => normalizedPath === route || normalizedPath.startsWith(`${route}/`),
  );
  if (isAdminRoute && session.role === "member") {
    return { allowed: false, redirectTo: "/unauthorized", reason: "forbidden" };
  }

  if (normalizedPath === "/unauthorized" && !hasSession) {
    const expiredSuffix = session.sessionExpired ? "&sessionExpired=1" : "";
    return {
      allowed: false,
      redirectTo: `/login?redirectTo=${encodeURIComponent(normalizedPath)}${expiredSuffix}`,
      reason: "login_required",
    };
  }

  return { allowed: true };
}

export function mockStoreReducer(state: MockState, action: MockAction): MockState {
  switch (action.type) {
    case "login":
      return login(state, action.email, action.password, action.redirectTo);
    case "logout":
      return {
        ...state,
        session: {
          userId: null,
          role: null,
          sessionExpired: false,
          intendedRedirectTo: null,
        },
      };
    case "expireSession":
      return {
        ...appendAuditEvent(state, {
          action: "session.expire",
          targetId: action.intendedRedirectTo,
          targetType: "session",
        }),
        session: {
          ...state.session,
          sessionExpired: true,
          intendedRedirectTo: sanitizeRedirectTo(action.intendedRedirectTo),
        },
      };
    case "switchRole":
      return switchRole(state, action.role);
    case "resetDemoData":
      return createSeed();
    case "hydrateState":
      return action.state;
    case "selectKnowledgeBase":
      return {
        ...state,
        selectedKnowledgeBaseId: action.knowledgeBaseId,
      };
    case "selectChatSession":
      return {
        ...state,
        selectedChatSessionId: action.sessionId,
      };
    case "createKnowledgeBase":
      return createKnowledgeBase(state, action.name, action.description);
    case "uploadFile":
      return addDocumentImport(state, {
        knowledgeBaseId: action.knowledgeBaseId,
        sourceLabel: action.fileName,
        sourceType: "file",
        title: action.fileName,
      });
    case "importUrl":
      return addDocumentImport(state, {
        knowledgeBaseId: action.knowledgeBaseId,
        sourceLabel: action.url,
        sourceType: "url",
        title: action.title ?? action.url,
      });
    case "retryJob":
      return retryJob(state, action.jobId);
    case "cancelJob":
      return cancelJob(state, action.jobId);
    case "newChatSession":
      return createChatSession(state, action.knowledgeBaseId);
    case "submitChatQuestion":
      return submitChatQuestion(state, action);
    case "submitChatFeedback":
      return submitChatFeedback(state, action.answerMessageId, action.rating, action.reason);
    case "saveProviderConfig":
      return saveProviderConfig(state, action.provider);
    case "deleteProviderConfig":
      return deleteProviderConfig(state, action.providerId);
    case "createUser":
      return createUser(state, {
        email: action.email,
        name: action.name,
        role: action.role,
        status: action.status,
      });
    case "updateUser":
      return updateUser(state, {
        email: action.email,
        name: action.name,
        role: action.role,
        status: action.status,
        userId: action.userId,
      });
    case "deleteUser":
      return deleteUser(state, action.userId);
    case "changeUserRole":
      return changeUserRole(state, action.userId, action.role);
    case "setUserStatus":
      return setUserStatus(state, action.userId, action.status);
    case "disableUser":
      return setUserStatus(state, action.userId, "disabled");
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

function isMockState(value: unknown): value is MockState {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.schemaVersion === 1 &&
    Array.isArray(value.knowledgeBases) &&
    Array.isArray(value.documents) &&
    Array.isArray(value.sources) &&
    Array.isArray(value.chunks) &&
    Array.isArray(value.jobs) &&
    Array.isArray(value.logs) &&
    Array.isArray(value.chatSessions) &&
    Array.isArray(value.citations) &&
    isValidProviderConfigs(value.providerConfigs) &&
    Array.isArray(value.users) &&
    Array.isArray(value.auditEvents) &&
    isRecord(value.session) &&
    typeof value.selectedKnowledgeBaseId === "string" &&
    typeof value.selectedChatSessionId === "string"
  );
}

function isValidProviderConfigs(value: unknown): value is MockProviderConfig[] {
  if (!Array.isArray(value)) {
    return false;
  }

  return value.every((item) => {
    if (!isRecord(item)) {
      return false;
    }

    return (
      isProviderKind(item.kind) &&
      (item.status === "enabled" ||
        item.status === "disabled" ||
        item.status === "testing" ||
        item.status === "error") &&
      typeof item.id === "string" &&
      typeof item.displayName === "string" &&
      typeof item.provider === "string" &&
      typeof item.modelId === "string" &&
      typeof item.baseUrl === "string" &&
      typeof item.maskedKeySuffix === "string" &&
      typeof item.keyVersion === "number" &&
      typeof item.updatedAt === "string"
    );
  });
}

function isProviderKind(value: unknown): value is MockProviderKind {
  return value === "chat" || value === "embedding" || value === "rerank";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeRoutePath(path: string): string {
  const [pathname] = path.split("?");
  return pathname === "" || pathname === undefined ? "/" : pathname;
}

function login(state: MockState, email: string, password: string, redirectTo: string | null): MockState {
  const user = state.users.find((item) => item.email === email && item.status === "active");
  if (user === undefined || password !== "password123") {
    return {
      ...state,
      session: {
        userId: null,
        role: null,
        sessionExpired: false,
        intendedRedirectTo: sanitizeRedirectTo(redirectTo),
      },
    };
  }

  return {
    ...state,
    session: {
      userId: user.id,
      role: user.role,
      sessionExpired: false,
      intendedRedirectTo: sanitizeRedirectTo(redirectTo),
    },
  };
}

function switchRole(state: MockState, role: MockRole): MockState {
  const user = state.users.find((item) => item.role === role && item.status === "active");
  if (user === undefined) {
    return state;
  }

  return {
    ...state,
    session: {
      userId: user.id,
      role: user.role,
      sessionExpired: false,
      intendedRedirectTo: "/workspace",
    },
  };
}

function createKnowledgeBase(state: MockState, name: string, description: string): MockState {
  if (state.session.role !== "admin") {
    return state;
  }

  const id = `kb-${slugify(name)}-${state.knowledgeBases.length + 1}`;
  const knowledgeBase: MockKnowledgeBase = {
    id,
    name,
    description,
    status: "empty",
    owner: currentUserName(state),
    visibility: "private",
    documentIds: [],
    createdAt: MOCK_NOW,
    updatedAt: MOCK_NOW,
  };

  return {
    ...appendAuditEvent(state, {
      action: "knowledge_base.create",
      targetId: id,
      targetType: "knowledge_base",
    }),
    selectedKnowledgeBaseId: id,
    knowledgeBases: [knowledgeBase, ...state.knowledgeBases],
  };
}

function addDocumentImport(
  state: MockState,
  input: {
    knowledgeBaseId: string;
    sourceType: "file" | "url";
    sourceLabel: string;
    title: string;
  },
): MockState {
  const documentId = `doc-${slugify(input.title)}-${state.documents.length + 1}`;
  const sourceId = `source-${documentId}`;
  const jobId = `job-${documentId}`;
  const log: MockProcessingLog = createProcessingLog(state, {
    documentId,
    jobId,
    knowledgeBaseId: input.knowledgeBaseId,
    level: "info",
    message: `已创建${input.sourceType === "file" ? "文件上传" : "URL 导入"}任务。`,
    step: "queued",
  });
  const source: MockSource = {
    id: sourceId,
    documentId,
    sourceType: input.sourceType,
    hashSummary: "sha256:mock...seed",
    processingStatus: "queued",
    ...(input.sourceType === "file"
      ? {
          fileName: input.sourceLabel,
          mimeType: "application/octet-stream",
          sizeLabel: "演示文件",
        }
      : {
          crawledAt: MOCK_NOW,
          fetchedSummary: "网页导入任务已创建，等待抓取正文。",
          fetchedTitle: input.title,
          url: input.sourceLabel,
        }),
  };
  const document: MockDocument = {
    id: documentId,
    knowledgeBaseId: input.knowledgeBaseId,
    title: input.title,
    sourceType: input.sourceType,
    status: "processing",
    version: "v1",
    sourceId,
    chunkIds: [],
    jobIds: [jobId],
    createdBy: currentUserName(state),
    createdAt: MOCK_NOW,
    updatedAt: MOCK_NOW,
  };
  const job: MockIngestionJob = {
    id: jobId,
    documentId,
    knowledgeBaseId: input.knowledgeBaseId,
    sourceType: input.sourceType,
    status: "queued",
    currentStep: "queued",
    attempts: 0,
    maxAttempts: 3,
    requestedBy: currentUserName(state),
    queuedAt: MOCK_NOW,
    finishedAt: null,
    lastError: null,
    logIds: [log.id],
  };
  const stateWithKnowledge = {
    ...state,
    selectedKnowledgeBaseId: input.knowledgeBaseId,
    knowledgeBases: state.knowledgeBases.map((item) =>
      item.id === input.knowledgeBaseId
        ? {
            ...item,
            documentIds: [documentId, ...item.documentIds],
            status: item.status === "empty" ? "processing" : item.status,
            updatedAt: MOCK_NOW,
          }
        : item,
    ),
    documents: [document, ...state.documents],
    sources: [source, ...state.sources],
    jobs: [job, ...state.jobs],
    logs: [log, ...state.logs],
  };

  return appendAuditEvent(stateWithKnowledge, {
    action: "document.import",
    targetId: documentId,
    targetType: "document",
  });
}

function retryJob(state: MockState, jobId: string): MockState {
  const job = state.jobs.find((item) => item.id === jobId);
  if (
    job === undefined ||
    (job.status !== "failed" && job.status !== "cancelled") ||
    job.attempts >= job.maxAttempts
  ) {
    return state;
  }

  const log = createProcessingLog(state, {
    documentId: job.documentId,
    jobId: job.id,
    knowledgeBaseId: job.knowledgeBaseId,
    level: "info",
    message: "已重新加入处理队列。",
    step: "queued",
  });
  const updatedState = {
    ...state,
    jobs: state.jobs.map((item) =>
      item.id === jobId
        ? {
            ...item,
            attempts: item.attempts + 1,
            currentStep: "queued" as const,
            finishedAt: null,
            lastError: null,
            logIds: [log.id, ...item.logIds],
            status: "queued" as const,
          }
        : item,
    ),
    logs: [log, ...state.logs],
  };

  return appendAuditEvent(updatedState, {
    action: "job.retry",
    targetId: jobId,
    targetType: "ingestion_job",
  });
}

function cancelJob(state: MockState, jobId: string): MockState {
  const job = state.jobs.find((item) => item.id === jobId);
  if (job === undefined || (job.status !== "queued" && job.status !== "running")) {
    return state;
  }

  const log = createProcessingLog(state, {
    documentId: job.documentId,
    jobId: job.id,
    knowledgeBaseId: job.knowledgeBaseId,
    level: "warning",
    message: "任务已由管理员取消。",
    step: job.currentStep,
  });
  const updatedState = {
    ...state,
    jobs: state.jobs.map((item) =>
      item.id === jobId
        ? {
            ...item,
            finishedAt: MOCK_NOW,
            logIds: [log.id, ...item.logIds],
            status: "cancelled" as const,
          }
        : item,
    ),
    logs: [log, ...state.logs],
  };

  return appendAuditEvent(updatedState, {
    action: "job.cancel",
    targetId: jobId,
    targetType: "ingestion_job",
  });
}

function createChatSession(state: MockState, knowledgeBaseId: string): MockState {
  const id = `session-${state.chatSessions.length + 1}`;
  const session: MockChatSession = {
    id,
    knowledgeBaseId,
    title: "新问答会话",
    messages: [],
    selectedAnswerId: null,
    createdAt: MOCK_NOW,
    updatedAt: MOCK_NOW,
  };

  return {
    ...state,
    selectedChatSessionId: id,
    chatSessions: [session, ...state.chatSessions],
  };
}

function submitChatQuestion(
  state: MockState,
  action: Extract<MockAction, { type: "submitChatQuestion" }>,
): MockState {
  const session = state.chatSessions.find((item) => item.id === action.sessionId);
  if (session === undefined || action.question.trim().length === 0) {
    return state;
  }

  const baseMessageId = `${action.sessionId}-${session.messages.length + 1}`;
  const userMessage: MockChatMessage = {
    id: `${baseMessageId}-user`,
    sessionId: action.sessionId,
    role: "user",
    lifecycle: "completed",
    content: action.question.trim(),
    citationIds: [],
    feedback: null,
  };
  const answerId = `${baseMessageId}-answer`;
  const citationIds = action.mode === "with_citation" ? [`citation-${answerId}`] : [];
  const assistantMessage: MockChatMessage = {
    id: answerId,
    sessionId: action.sessionId,
    role: "assistant",
    lifecycle: lifecycleForMode(action.mode),
    content: answerContentForMode(action.mode, action.question),
    citationIds,
    feedback: null,
  };
  const newCitation =
    action.mode === "with_citation"
      ? createCitationForAnswer(answerId, citationIds[0] ?? `citation-${answerId}`)
      : null;

  return {
    ...state,
    selectedChatSessionId: action.sessionId,
    chatSessions: state.chatSessions.map((item) =>
      item.id === action.sessionId
        ? {
            ...item,
            knowledgeBaseId: action.knowledgeBaseId,
            messages: [...item.messages, userMessage, assistantMessage],
            selectedAnswerId: answerId,
            title: item.messages.length === 0 ? action.question.trim().slice(0, 18) : item.title,
            updatedAt: MOCK_NOW,
          }
        : item,
    ),
    citations: newCitation === null ? state.citations : [newCitation, ...state.citations],
  };
}

function submitChatFeedback(
  state: MockState,
  answerMessageId: string,
  rating: "useful" | "not_useful",
  reason: string,
): MockState {
  const updatedState = {
    ...state,
    chatSessions: state.chatSessions.map((session) => ({
      ...session,
      messages: session.messages.map((message) =>
        message.id === answerMessageId
          ? {
              ...message,
              feedback: {
                rating,
                reason,
                submittedAt: MOCK_NOW,
              },
            }
          : message,
      ),
    })),
  };

  return appendAuditEvent(updatedState, {
    action: "chat.feedback.submit",
    targetId: answerMessageId,
    targetType: "chat_message",
  });
}

function saveProviderConfig(state: MockState, input: MockProviderConfigInput): MockState {
  if (!passesProviderConnectionTest(state, input)) {
    return state;
  }

  const existing = input.id === undefined
    ? state.providerConfigs.find((item) => item.kind === input.kind)
    : state.providerConfigs.find((item) => item.id === input.id);
  const targetId = existing?.id ?? `provider-${input.kind}-main`;
  const apiKey = input.apiKey?.trim() ?? "";
  const keyVersion = existing === undefined ? 1 : apiKey.length > 0 ? existing.keyVersion + 1 : existing.keyVersion;
  const providerConfig: MockProviderConfig = {
    id: targetId,
    baseUrl: input.baseUrl.trim(),
    displayName: input.displayName.trim(),
    kind: input.kind,
    keyVersion,
    maskedKeySuffix: apiKey.length > 0
      ? maskedKeySuffix(apiKey)
      : existing?.maskedKeySuffix ?? "•••• NEW1",
    modelId: input.modelId.trim(),
    provider: input.provider.trim(),
    status: input.status,
    updatedAt: MOCK_NOW,
  };
  const withoutSameKind = state.providerConfigs.filter((item) => item.kind !== input.kind);
  const stateWithProvider = {
    ...state,
    providerConfigs: sortProviderConfigsByKind([...withoutSameKind, providerConfig]),
  };
  const stateWithSaveAudit = appendAuditEvent(stateWithProvider, {
    action: existing === undefined ? "provider.create" : "provider.update",
    targetId,
    targetType: "provider",
  });

  return appendAuditEvent(stateWithSaveAudit, {
    action: "provider.test_connection",
    targetId,
    targetType: "provider",
  });
}

function deleteProviderConfig(state: MockState, providerId: string): MockState {
  const provider = state.providerConfigs.find((item) => item.id === providerId);
  if (provider === undefined) {
    return state;
  }

  return appendAuditEvent(
    {
      ...state,
      providerConfigs: state.providerConfigs.filter((item) => item.id !== providerId),
    },
    {
      action: "provider.delete",
      targetId: providerId,
      targetType: "provider",
    },
  );
}

function passesProviderConnectionTest(state: MockState, input: MockProviderConfigInput): boolean {
  const existing = input.id === undefined
    ? state.providerConfigs.find((item) => item.kind === input.kind)
    : state.providerConfigs.find((item) => item.id === input.id);
  const hasReusableKey = existing !== undefined && (input.apiKey ?? "").trim().length === 0;

  if (
    input.displayName.trim().length === 0 ||
    input.provider.trim().length === 0 ||
    input.modelId.trim().length === 0 ||
    !isValidHttpUrl(input.baseUrl.trim())
  ) {
    return false;
  }

  return hasReusableKey || (input.apiKey ?? "").trim().length > 0;
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function maskedKeySuffix(apiKey: string): string {
  return `•••• ${apiKey.slice(-4).toUpperCase()}`;
}

function sortProviderConfigsByKind(providers: MockProviderConfig[]): MockProviderConfig[] {
  const order: Record<MockProviderKind, number> = {
    chat: 0,
    embedding: 1,
    rerank: 2,
  };

  return [...providers].sort((first, second) => order[first.kind] - order[second.kind]);
}

function createUser(
  state: MockState,
  input: {
    email: string;
    name: string;
    role: MockRole;
    status: MockUserStatus;
  },
): MockState {
  const email = input.email.trim();
  const user: MockUser = {
    id: `user-${slugify(email)}-${state.users.length + 1}`,
    name: input.name.trim(),
    email,
    role: input.role,
    emailVerified: true,
    status: input.status,
    createdAt: MOCK_NOW,
    updatedAt: MOCK_NOW,
  };

  return appendAuditEvent(
    {
      ...state,
      users: [user, ...state.users],
    },
    {
      action: "user.create",
      targetId: user.id,
      targetType: "user",
    },
  );
}

function updateUser(
  state: MockState,
  input: {
    email: string;
    name: string;
    role: MockRole;
    status: MockUserStatus;
    userId: string;
  },
): MockState {
  const user = state.users.find((item) => item.id === input.userId);
  if (user === undefined) {
    return state;
  }

  return appendAuditEvent(
    {
      ...state,
      users: state.users.map((item) =>
        item.id === input.userId
          ? {
              ...item,
              email: input.email.trim(),
              name: input.name.trim(),
              role: input.role,
              status: input.status,
              updatedAt: MOCK_NOW,
            }
          : item,
      ),
    },
    {
      action: "user.update",
      targetId: input.userId,
      targetType: "user",
    },
  );
}

function deleteUser(state: MockState, userId: string): MockState {
  const user = state.users.find((item) => item.id === userId);
  if (user === undefined) {
    return state;
  }

  return appendAuditEvent(
    {
      ...state,
      users: state.users.filter((item) => item.id !== userId),
    },
    {
      action: "user.delete",
      targetId: userId,
      targetType: "user",
    },
  );
}

function changeUserRole(state: MockState, userId: string, role: MockRole): MockState {
  const updatedState = {
    ...state,
    users: state.users.map((item) =>
      item.id === userId
        ? {
            ...item,
            role,
            updatedAt: MOCK_NOW,
          }
        : item,
    ),
  };

  return appendAuditEvent(updatedState, {
    action: "user.role_change",
    targetId: userId,
    targetType: "user",
  });
}

function setUserStatus(
  state: MockState,
  userId: string,
  status: Extract<MockUserStatus, "active" | "disabled">,
): MockState {
  const updatedState = {
    ...state,
    users: state.users.map((item) =>
      item.id === userId
        ? {
            ...item,
            status,
            updatedAt: MOCK_NOW,
          }
        : item,
    ),
  };

  return appendAuditEvent(updatedState, {
    action: status === "active" ? "user.enable" : "user.disable",
    targetId: userId,
    targetType: "user",
  });
}

function appendAuditEvent(
  state: MockState,
  input: {
    action: MockAuditAction;
    targetType: MockTargetType;
    targetId: string;
  },
): MockState {
  const event: MockAuditEvent = {
    id: `audit-${state.auditEvents.length + 1}-${slugify(input.targetId)}`,
    actorId: state.session.userId ?? "system",
    actorType: state.session.userId === null ? "system" : "user",
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    requestId: `req-${state.auditEvents.length + 1}`,
    ipSummary: "10.0.0.12/24",
    userAgentSummary: "Mock Browser",
    sanitizedMetadata: "frontendMock=true",
    createdAt: MOCK_NOW,
  };

  return {
    ...state,
    auditEvents: [event, ...state.auditEvents],
  };
}

function createProcessingLog(state: MockState, input: {
  documentId: string;
  jobId: string;
  knowledgeBaseId: string;
  level: MockLogLevel;
  step: MockProcessingLog["step"];
  message: string;
}): MockProcessingLog {
  const baseId = `log-${slugify(input.jobId)}-${input.step}-${MOCK_NOW}`;

  return {
    id: uniqueLogId(baseId, state.logs),
    jobId: input.jobId,
    documentId: input.documentId,
    knowledgeBaseId: input.knowledgeBaseId,
    level: input.level,
    step: input.step,
    message: input.message,
    errorCode: input.level === "error" ? "MOCK_ERROR" : null,
    requestId: `req-${slugify(input.jobId)}`,
    metadataSummary: "frontendMock=true",
    createdAt: MOCK_NOW,
  };
}

function uniqueLogId(baseId: string, logs: MockProcessingLog[]): string {
  const existingIds = new Set(logs.map((log) => log.id));
  if (!existingIds.has(baseId)) {
    return baseId;
  }

  let suffix = 2;
  while (existingIds.has(`${baseId}-${suffix}`)) {
    suffix += 1;
  }

  return `${baseId}-${suffix}`;
}

function lifecycleForMode(mode: ChatAnswerMode): MockChatMessage["lifecycle"] {
  if (mode === "with_citation") {
    return "completed";
  }
  if (mode === "retrieving") {
    return "retrieving";
  }
  if (mode === "generating") {
    return "generating";
  }
  if (mode === "no_citation") {
    return "no_citation";
  }

  return "failed";
}

function answerContentForMode(mode: ChatAnswerMode, question: string): string {
  if (mode === "retrieving") {
    return `正在检索可支撑“${question}”的知识库片段。`;
  }

  if (mode === "generating") {
    return `已找到相关片段，正在生成“${question}”的答案。`;
  }

  if (mode === "failed") {
    return `针对“${question}”的回答生成失败。请求编号：req-chat-mock。`;
  }

  if (mode === "no_citation") {
    return `已生成回答，但当前知识库没有可支撑“${question}”的引用来源，请谨慎使用。`;
  }

  return `根据差旅报销管理办法，${question.includes("住宿") ? "一线城市住宿费标准为每晚 650 元以内，超出标准需补充审批。" : "相关制度要求先完成审批并保留票据。"} 可在右侧引用中核验来源。`;
}

function createCitationForAnswer(answerId: string, citationId: string): MockCitation {
  return {
    id: citationId,
    answerMessageId: answerId,
    documentId: "doc-travel-policy",
    chunkId: "chunk-travel-001",
    title: "差旅报销管理办法 2026",
    locator: "第 4 页",
    excerpt: "一线城市住宿费标准为每晚 650 元以内。",
    matchReason: "命中“住宿费标准”和“审批层级”。",
  };
}

function currentUserName(state: MockState): string {
  const user = state.users.find((item) => item.id === state.session.userId);
  return user?.name ?? "演示用户";
}

function slugify(value: string): string {
  const ascii = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  if (ascii.length > 0) {
    return ascii.slice(0, 36);
  }

  return Array.from(value)
    .map((char) => char.codePointAt(0)?.toString(16) ?? "0")
    .join("-")
    .slice(0, 36);
}
