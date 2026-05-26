"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  chatMessagesResponseSchema,
  chatSessionsResponseSchema,
  chatSubmitResponseSchema,
  createChatSessionInputSchema,
  createChatSessionResponseSchema,
  submitAnswerFeedbackInputSchema,
  submitAnswerFeedbackResponseSchema,
  submitChatQuestionInputSchema,
  type ChatMessagesResponse,
  type ChatSessionsResponse,
  type ChatSubmitResponse,
  type CreateChatSessionInput,
  type CreateChatSessionResponse,
  type SubmitAnswerFeedbackInput,
  type SubmitAnswerFeedbackResponse,
  type SubmitChatQuestionInput,
} from "@kb/rag";

import { apiClient, parseApiClientResponse } from "../api/client";

export interface ChatSessionsQuery {
  knowledgeBaseId?: string;
}

export const chatSessionsQueryKey = (input: ChatSessionsQuery) =>
  ["chat", "sessions", input] as const;

export const chatMessagesQueryKey = (sessionId: string | null) =>
  ["chat", "messages", sessionId] as const;

export function useChatSessions(input: ChatSessionsQuery) {
  return useQuery({
    queryKey: chatSessionsQueryKey(input),
    queryFn: async (): Promise<ChatSessionsResponse["sessions"]> => {
      const response = await parseApiClientResponse<ChatSessionsResponse>({
        dataSchema: chatSessionsResponseSchema,
        response: await apiClient.api.chat.sessions.$get({
          query:
            input.knowledgeBaseId === undefined
              ? {}
              : { knowledgeBaseId: input.knowledgeBaseId },
        }),
      });

      return response.data.sessions;
    },
  });
}

export function useCreateChatSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      input: CreateChatSessionInput,
    ): Promise<CreateChatSessionResponse["session"]> => {
      const body = createChatSessionInputSchema.parse(input);
      const response = await parseApiClientResponse<CreateChatSessionResponse>({
        dataSchema: createChatSessionResponseSchema,
        response: await apiClient.api.chat.sessions.$post({ json: body }),
      });

      return response.data.session;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chat", "sessions"] });
    },
  });
}

export function useChatMessages(sessionId: string | null) {
  return useQuery({
    enabled: sessionId !== null && sessionId.length > 0,
    queryKey: chatMessagesQueryKey(sessionId),
    queryFn: async (): Promise<ChatMessagesResponse["messages"]> => {
      if (sessionId === null || sessionId.length === 0) {
        throw new Error("Missing chat session id.");
      }

      const response = await parseApiClientResponse<ChatMessagesResponse>({
        dataSchema: chatMessagesResponseSchema,
        response: await apiClient.api.chat.sessions[":sessionId"].messages.$get({
          param: { sessionId },
        }),
      });

      return response.data.messages;
    },
  });
}

export function useSubmitChatQuestion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: SubmitChatQuestionInput): Promise<ChatSubmitResponse> => {
      const body = submitChatQuestionInputSchema.parse(input);
      const response = await parseApiClientResponse<ChatSubmitResponse>({
        dataSchema: chatSubmitResponseSchema,
        response: await apiClient.api.chat.messages.$post({ json: body }),
      });

      return response.data;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["chat", "sessions"] });
      queryClient.invalidateQueries({
        queryKey: chatMessagesQueryKey(result.session.id),
      });
    },
  });
}

export function useSubmitAnswerFeedback(messageId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      input: SubmitAnswerFeedbackInput,
    ): Promise<SubmitAnswerFeedbackResponse> => {
      if (messageId === null || messageId.length === 0) {
        throw new Error("Missing answer message id.");
      }

      const body = submitAnswerFeedbackInputSchema.parse(input);
      const response = await parseApiClientResponse<SubmitAnswerFeedbackResponse>({
        dataSchema: submitAnswerFeedbackResponseSchema,
        response: await apiClient.api.chat.messages[
          ":messageId"
        ].feedback.$post({
          json: body,
          param: { messageId },
        }),
      });

      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chat", "messages"] });
    },
  });
}
