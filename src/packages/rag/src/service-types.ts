import type {
  ChatMessagesResponse,
  ChatSessionSummary,
  ChatSessionsResponse,
  ChatSubmitResponse,
  CreateChatSessionInput,
  GroundingLabel,
  RankedRetrievalCandidate,
  RetrievalSourceCandidate,
  SubmitAnswerFeedbackInput,
  SubmitAnswerFeedbackResponse,
  SubmitChatQuestionInput,
} from "./types";

export interface RagActor {
  user: { id: string };
  tenant: { id: string };
  role: "admin" | "member";
}

export interface RagServiceError {
  ok: false;
  code:
    | "VALIDATION_ERROR"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "RATE_LIMITED"
    | "PROVIDER_UNAVAILABLE"
    | "INTERNAL_ERROR";
  httpStatus: 400 | 401 | 403 | 404 | 429 | 500;
  message: string;
}

export interface RagChatRepository {
  appendMessage(input: {
    actor: RagActor;
    citations?: RankedRetrievalCandidate[];
    content: string;
    groundingLabel: GroundingLabel | null;
    knowledgeBaseId: string;
    retrievalRunId: string | null;
    role: "user" | "assistant";
    sessionId: string;
  }): Promise<ChatMessagesResponse["messages"][number]>;
  authorizeKnowledgeBase(input: {
    actor: RagActor;
    knowledgeBaseId: string;
  }): Promise<boolean>;
  completeRetrievalRun(input: {
    actor: RagActor;
    errorCode?: string;
    errorMessage?: string;
    retrievalRunId: string;
    status: "completed" | "failed";
  }): Promise<void>;
  createSession(input: {
    actor: RagActor;
    knowledgeBaseId: string;
    title: string;
  }): Promise<ChatSessionSummary>;
  canAccessMessage(input: {
    actor: RagActor;
    messageId: string;
    role?: "user" | "assistant";
  }): Promise<boolean>;
  getSession(input: {
    actor: RagActor;
    knowledgeBaseId?: string;
    sessionId: string;
  }): Promise<ChatSessionSummary | null>;
  listMessages(input: {
    actor: RagActor;
    sessionId: string;
  }): Promise<ChatMessagesResponse>;
  listRecentMessages(input: {
    actor: RagActor;
    limit: number;
    sessionId: string;
  }): Promise<ChatMessagesResponse["messages"]>;
  listSessions(input: {
    actor: RagActor;
    query: { knowledgeBaseId?: string };
  }): Promise<ChatSessionsResponse>;
  saveFeedback(input: {
    actor: RagActor;
    body: SubmitAnswerFeedbackInput;
    messageId: string;
  }): Promise<SubmitAnswerFeedbackResponse>;
  recordRetrievalResults(input: {
    actor: RagActor;
    candidates: RankedRetrievalCandidate[];
    retrievalRunId: string;
  }): Promise<void>;
  startRetrievalRun(input: {
    actor: RagActor;
    knowledgeBaseId: string;
    messageId: string;
    query: string;
    requestId: string;
    sessionId: string;
  }): Promise<{ id: string }>;
  vectorSearch(input: {
    knowledgeBaseId: string;
    limit: number;
    tenantId: string;
    vector: number[];
  }): Promise<RetrievalSourceCandidate[]>;
}

export interface RagEmbeddingProvider {
  embedQuery(input: {
    query: string;
    requestId: string;
    tenantId: string;
  }): Promise<{ ok: true; vector: number[] } | { ok: false; code: string }>;
}

export interface RagKeywordSearcher {
  search(input: {
    knowledgeBaseId: string;
    limit: number;
    query: string;
    tenantId: string;
  }): Promise<RetrievalSourceCandidate[]>;
}

export interface RagReranker {
  rerank(input: {
    candidates: RankedRetrievalCandidate[];
    query: string;
    requestId: string;
    tenantId: string;
  }): Promise<
    | { ok: true; results: { chunkId: string; score: number }[] }
    | { ok: false; code: string }
  >;
}

export interface RagAnswerGenerator {
  generate(input: {
    context: string;
    history: ChatMessagesResponse["messages"];
    question: string;
    requestId: string;
    tenantId: string;
  }): Promise<{ ok: true; text: string } | { ok: false; code: string }>;
}

export interface RagChatService {
  createSession(input: {
    actor: RagActor;
    body: CreateChatSessionInput;
  }): Promise<
    { ok: true; result: { session: ChatSessionSummary } } | RagServiceError
  >;
  listMessages(input: {
    actor: RagActor;
    sessionId: string;
  }): Promise<{ ok: true; result: ChatMessagesResponse } | RagServiceError>;
  listSessions(input: {
    actor: RagActor;
    query: { knowledgeBaseId?: string };
  }): Promise<{ ok: true; result: ChatSessionsResponse } | RagServiceError>;
  submitFeedback(input: {
    actor: RagActor;
    body: SubmitAnswerFeedbackInput;
    messageId: string;
  }): Promise<
    { ok: true; result: SubmitAnswerFeedbackResponse } | RagServiceError
  >;
  submitQuestion(input: {
    actor: RagActor;
    body: SubmitChatQuestionInput;
    requestId: string;
  }): Promise<{ ok: true; result: ChatSubmitResponse } | RagServiceError>;
}
