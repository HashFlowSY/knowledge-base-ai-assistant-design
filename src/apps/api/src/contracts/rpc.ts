import type { HonoBase } from "hono/hono-base";
import type { Endpoint } from "hono/types";

import type { SessionPayload } from "@kb/auth";
import type {
  ProviderListResponse,
  ProviderPublicKey,
  ProviderSummary,
  SaveProviderConfigInput,
} from "@kb/ai-providers";
import type {
  CreateKnowledgeBaseInput,
  DocumentFileUploadResult,
  DocumentProcessingPage,
  KnowledgeBaseDetail,
  KnowledgeBaseSummary,
  KnowledgeBasesPage,
  RetryDocumentProcessingResult,
  UpdateKnowledgeBaseInput,
} from "@kb/knowledge";
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
} from "@kb/users";
import type {
  ChatMessagesResponse,
  ChatSessionsResponse,
  ChatSubmitResponse,
  CreateChatSessionInput,
  SubmitAnswerFeedbackInput,
  SubmitAnswerFeedbackResponse,
  SubmitChatQuestionInput,
} from "@kb/rag";

import type { ApiEnv } from "./context";

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
  "/api/knowledge-bases": {
    $get: JsonEndpoint<
      {
        query?: {
          page?: string;
          pageSize?: string;
          search?: string;
          sort?: string;
        };
      },
      ApiSuccessResponse<KnowledgeBasesPage> | ApiErrorResponse,
      200 | 401 | 403 | 429 | 500
    >;
    $post: JsonEndpoint<
      { json: CreateKnowledgeBaseInput },
      ApiSuccessResponse<KnowledgeBaseSummary> | ApiErrorResponse,
      201 | 400 | 401 | 403 | 409 | 429 | 500
    >;
  };
  "/api/knowledge-bases/:knowledgeBaseId": {
    $get: JsonEndpoint<
      { param: { knowledgeBaseId: string } },
      ApiSuccessResponse<KnowledgeBaseDetail> | ApiErrorResponse,
      200 | 401 | 403 | 404 | 429 | 500
    >;
    $patch: JsonEndpoint<
      { json: UpdateKnowledgeBaseInput; param: { knowledgeBaseId: string } },
      ApiSuccessResponse<KnowledgeBaseDetail> | ApiErrorResponse,
      200 | 400 | 401 | 403 | 404 | 409 | 429 | 500
    >;
  };
  "/api/knowledge-bases/:knowledgeBaseId/documents/upload": {
    $post: JsonEndpoint<
      {
        form: {
          file: File;
          title?: string;
        };
        param: { knowledgeBaseId: string };
      },
      ApiSuccessResponse<DocumentFileUploadResult> | ApiErrorResponse,
      200 | 201 | 400 | 401 | 403 | 404 | 409 | 413 | 415 | 429 | 500
    >;
  };
  "/api/knowledge-bases/:knowledgeBaseId/documents/processing": {
    $get: JsonEndpoint<
      {
        param: { knowledgeBaseId: string };
        query?: {
          page?: string;
          pageSize?: string;
        };
      },
      ApiSuccessResponse<DocumentProcessingPage> | ApiErrorResponse,
      200 | 400 | 401 | 403 | 404 | 429 | 500
    >;
  };
  "/api/knowledge-bases/:knowledgeBaseId/documents/:documentId/retry": {
    $post: JsonEndpoint<
      {
        json: Record<string, never>;
        param: { documentId: string; knowledgeBaseId: string };
      },
      ApiSuccessResponse<RetryDocumentProcessingResult> | ApiErrorResponse,
      200 | 400 | 401 | 403 | 404 | 415 | 429 | 500
    >;
  };
  "/api/chat/sessions": {
    $get: JsonEndpoint<
      { query?: { knowledgeBaseId?: string } },
      ApiSuccessResponse<ChatSessionsResponse> | ApiErrorResponse,
      200 | 400 | 401 | 403 | 429 | 500
    >;
    $post: JsonEndpoint<
      { json: CreateChatSessionInput },
      | ApiSuccessResponse<{ session: ChatSessionsResponse["sessions"][number] }>
      | ApiErrorResponse,
      200 | 400 | 401 | 403 | 429 | 500
    >;
  };
  "/api/chat/sessions/:sessionId/messages": {
    $get: JsonEndpoint<
      { param: { sessionId: string } },
      ApiSuccessResponse<ChatMessagesResponse> | ApiErrorResponse,
      200 | 401 | 403 | 404 | 429 | 500
    >;
  };
  "/api/chat/messages": {
    $post: JsonEndpoint<
      { json: SubmitChatQuestionInput },
      ApiSuccessResponse<ChatSubmitResponse> | ApiErrorResponse,
      200 | 400 | 401 | 403 | 404 | 429 | 500
    >;
  };
  "/api/chat/messages/:messageId/feedback": {
    $post: JsonEndpoint<
      { json: SubmitAnswerFeedbackInput; param: { messageId: string } },
      ApiSuccessResponse<SubmitAnswerFeedbackResponse> | ApiErrorResponse,
      200 | 400 | 401 | 403 | 404 | 429 | 500
    >;
  };
  "/api/providers": {
    $get: JsonEndpoint<
      Record<string, never>,
      ApiSuccessResponse<ProviderListResponse> | ApiErrorResponse,
      200 | 401 | 403 | 429 | 500
    >;
  };
  "/api/providers/public-key": {
    $get: JsonEndpoint<
      Record<string, never>,
      ApiSuccessResponse<ProviderPublicKey> | ApiErrorResponse,
      200 | 401 | 403 | 429 | 500
    >;
  };
  "/api/providers/:kind": {
    $put: JsonEndpoint<
      {
        json: SaveProviderConfigInput;
        param: { kind: string };
      },
      ApiSuccessResponse<ProviderSummary> | ApiErrorResponse,
      200 | 400 | 401 | 403 | 409 | 429 | 500
    >;
  };
};

export type ApiApp = HonoBase<ApiEnv, ApiRouteSchema, "/">;
