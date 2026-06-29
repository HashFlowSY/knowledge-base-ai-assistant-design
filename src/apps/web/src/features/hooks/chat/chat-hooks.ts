"use client";

import { useCallback, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  chatStreamEventSchema,
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
  type ChatStreamEvent,
  type ChatSubmitResponse,
  type CreateChatSessionInput,
  type CreateChatSessionResponse,
  type SubmitAnswerFeedbackInput,
  type SubmitAnswerFeedbackResponse,
  type SubmitChatQuestionInput,
} from "@kb/rag";
import { apiErrorResponseSchema } from "@kb/shared";

import {
  ApiClientError,
  apiClient,
  parseApiClientResponse,
} from "../../api/client";

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

export type ChatStreamPhase =
  | "idle"
  | "retrieval"
  | "generating"
  | "completed"
  | "error"
  | "cancelled";

export interface ChatStreamFrame {
  event: ChatStreamEvent;
  id: string;
}

export interface SubmitChatQuestionStreamOptions {
  onCancel?: () => void;
  onError?: (error: Error) => void;
  onEvent?: (event: ChatStreamEvent, frame: ChatStreamFrame) => void;
}

export function useSubmitChatQuestionStream(): {
  cancel: () => void;
  error: Error | null;
  isStreaming: boolean;
  phase: ChatStreamPhase;
  submit: (
    input: SubmitChatQuestionInput,
    options?: SubmitChatQuestionStreamOptions,
  ) => Promise<void>;
} {
  const queryClient = useQueryClient();
  const abortControllerRef = useRef<AbortController | null>(null);
  const streamedSessionIdRef = useRef<string | null>(null);
  const [phase, setPhase] = useState<ChatStreamPhase>("idle");
  const [error, setError] = useState<Error | null>(null);

  const invalidateStreamedSession = useCallback(async () => {
    const streamedSessionId = streamedSessionIdRef.current;
    await queryClient.invalidateQueries({ queryKey: ["chat", "sessions"] });
    if (streamedSessionId !== null) {
      await queryClient.invalidateQueries({
        queryKey: chatMessagesQueryKey(streamedSessionId),
      });
    }
  }, [queryClient]);

  const cancel = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const submit = useCallback(
    async (
      input: SubmitChatQuestionInput,
      options: SubmitChatQuestionStreamOptions = {},
    ): Promise<void> => {
      abortControllerRef.current?.abort();
      const body = submitChatQuestionInputSchema.parse(input);
      const controller = new AbortController();
      abortControllerRef.current = controller;
      streamedSessionIdRef.current = body.sessionId;
      setError(null);
      setPhase("retrieval");

      try {
        const response = await fetch("/api/chat/messages/stream", {
          body: JSON.stringify(body),
          credentials: "include",
          headers: {
            "content-type": "application/json",
          },
          method: "POST",
          signal: controller.signal,
        });
        await assertChatStreamResponse(response);

        await readChatStreamResponse({
          onFrame: (frame) => {
            const event = frame.event;
            if (event.event === "session") {
              streamedSessionIdRef.current = event.data.session.id;
            }
            if (event.event === "retrieval_completed") {
              setPhase("generating");
            }
            if (event.event === "answer_delta") {
              setPhase("generating");
            }
            if (event.event === "answer_completed") {
              streamedSessionIdRef.current = event.data.session.id;
              setPhase("completed");
            }
            if (event.event === "error") {
              options.onEvent?.(event, frame);
              throw createChatStreamEventError(event);
            }
            options.onEvent?.(event, frame);
          },
          response,
        });

        await invalidateStreamedSession();
      } catch (caught) {
        if (controller.signal.aborted) {
          setPhase("cancelled");
          options.onCancel?.();
          await invalidateStreamedSession();
          return;
        }

        const nextError = normalizeChatStreamError(caught);
        setError(nextError);
        setPhase("error");
        options.onError?.(nextError);
        await invalidateStreamedSession();
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
      }
    },
    [invalidateStreamedSession],
  );

  return {
    cancel,
    error,
    isStreaming: phase === "retrieval" || phase === "generating",
    phase,
    submit,
  };
}

export async function assertChatStreamResponse(response: Response): Promise<void> {
  const contentType = response.headers.get("content-type") ?? "";
  if (response.ok && contentType.includes("text/event-stream")) {
    return;
  }

  let raw: unknown = null;
  try {
    raw = await response.json();
  } catch {
    throw new Error("回答生成失败，请重试。");
  }

  const parsed = apiErrorResponseSchema.safeParse(raw);
  if (parsed.success) {
    throw new ApiClientError(parsed.data);
  }

  throw new Error("回答生成失败，请重试。");
}

export function parseChatStreamFrame(frame: string): ChatStreamFrame {
  const lines = frame.split(/\r?\n/);
  const id = lines
    .find((line) => line.startsWith("id:"))
    ?.slice("id:".length)
    .trim();
  const eventName = lines
    .find((line) => line.startsWith("event:"))
    ?.slice("event:".length)
    .trim();
  const data = lines
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trimStart())
    .join("\n");

  if (id === undefined || eventName === undefined || data.length === 0) {
    throw new Error("Malformed chat stream frame.");
  }

  return {
    event: chatStreamEventSchema.parse({
      event: eventName,
      data: JSON.parse(data),
    }),
    id,
  };
}

export function createChatStreamEventError(
  event: Extract<ChatStreamEvent, { event: "error" }>,
): Error {
  const error = new Error(event.data.message);
  error.name = event.data.code;
  return error;
}

async function readChatStreamResponse(input: {
  onFrame: (frame: ChatStreamFrame) => void;
  response: Response;
}): Promise<void> {
  if (input.response.body === null) {
    throw new Error("回答生成失败，请重试。");
  }

  const reader = input.response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const read = await reader.read();
      if (read.done) {
        break;
      }

      buffer += decoder.decode(read.value, { stream: true });
      while (true) {
        const boundary = findSseFrameBoundary(buffer);
        if (boundary === null) {
          break;
        }
        const frame = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary.length);
        if (frame.trim().length > 0) {
          input.onFrame(parseChatStreamFrame(frame));
        }
      }
    }

    buffer += decoder.decode();
    if (buffer.trim().length > 0) {
      input.onFrame(parseChatStreamFrame(buffer));
    }
  } finally {
    reader.releaseLock();
  }
}

function findSseFrameBoundary(buffer: string):
  | {
      index: number;
      length: number;
    }
  | null {
  const lfIndex = buffer.indexOf("\n\n");
  const crlfIndex = buffer.indexOf("\r\n\r\n");
  if (lfIndex === -1 && crlfIndex === -1) {
    return null;
  }
  if (lfIndex !== -1 && (crlfIndex === -1 || lfIndex < crlfIndex)) {
    return { index: lfIndex, length: 2 };
  }

  return { index: crlfIndex, length: 4 };
}

function normalizeChatStreamError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  return new Error("回答生成失败，请重试。");
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
        response: await apiClient.api.chat.messages[":messageId"].feedback.$post({
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
