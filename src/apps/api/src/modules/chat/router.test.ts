import { describe, expect, it } from "vitest";

import {
  chatMessagesResponseSchema,
  chatSessionsResponseSchema,
  chatStreamEventSchema,
  chatSubmitResponseSchema,
  submitAnswerFeedbackResponseSchema,
} from "@kb/rag";
import { apiErrorResponseSchema, apiSuccessResponseSchema } from "@kb/shared";

import { createApiApp, type ChatService } from "../../app";
import { adminSession, createStaticAuthService } from "../../testing/fakes";

const KNOWLEDGE_BASE_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";
const MESSAGE_ID = "33333333-3333-4333-8333-333333333333";

const sessionSummary = {
  id: SESSION_ID,
  title: "差旅制度",
  knowledgeBaseId: KNOWLEDGE_BASE_ID,
  createdAt: "2026-05-25T00:00:00.000Z",
  updatedAt: "2026-05-25T00:00:00.000Z",
  messageCount: 2,
};

const assistantMessage = {
  id: MESSAGE_ID,
  sessionId: SESSION_ID,
  role: "assistant" as const,
  content: "差旅住宿标准见引用。",
  sequence: 2,
  createdAt: "2026-05-25T00:00:02.000Z",
  groundingLabel: "依据充分" as const,
  retrievalRunId: "run_1",
  citations: [
    {
      id: "citation_1",
      messageId: MESSAGE_ID,
      retrievalRunId: "run_1",
      knowledgeBaseId: KNOWLEDGE_BASE_ID,
      documentId: "doc_1",
      chunkId: "chunk_1",
      sourceTitle: "差旅制度",
      sourceUri: "s3://policy",
      sourceLocator: "P1",
      snippet: "住宿标准",
      rank: 1,
    },
  ],
  feedback: null,
};

describe("chat API router", () => {
  it("lists chat sessions without a knowledge base filter", async () => {
    const chatService: Partial<ChatService> = {
      async listSessions(input) {
        expect(input.actor).toEqual(adminSession);
        expect(input.query).toEqual({});
        return { ok: true, result: { sessions: [sessionSummary] } };
      },
    };
    const app = createApiApp({
      authService: createStaticAuthService(adminSession),
      chatService,
    });

    const response = await app.request("/api/chat/sessions", {
      headers: {
        cookie: "better-auth.session_token=token",
        "x-request-id": "req_chat_sessions",
      },
    });

    expect(response.status).toBe(200);
    expect(
      apiSuccessResponseSchema(chatSessionsResponseSchema).parse(
        await response.json(),
      ),
    ).toMatchObject({
      data: { sessions: [{ id: SESSION_ID }] },
      requestId: "req_chat_sessions",
    });
  });

  it("passes a valid knowledge base filter to the chat session service", async () => {
    const chatService: Partial<ChatService> = {
      async listSessions(input) {
        expect(input.query).toEqual({ knowledgeBaseId: KNOWLEDGE_BASE_ID });
        return { ok: true, result: { sessions: [] } };
      },
    };
    const app = createApiApp({
      authService: createStaticAuthService(adminSession),
      chatService,
    });

    const response = await app.request(
      `/api/chat/sessions?knowledgeBaseId=${KNOWLEDGE_BASE_ID}`,
      {
        headers: {
          cookie: "better-auth.session_token=token",
          "x-request-id": "req_chat_sessions_filtered",
        },
      },
    );

    expect(response.status).toBe(200);
    expect(
      apiSuccessResponseSchema(chatSessionsResponseSchema).parse(
        await response.json(),
      ),
    ).toMatchObject({
      data: { sessions: [] },
      requestId: "req_chat_sessions_filtered",
    });
  });

  it("returns a validation envelope for an empty chat sessions knowledge base filter", async () => {
    const app = createApiApp({
      authService: createStaticAuthService(adminSession),
      chatService: {
        async listSessions() {
          throw new Error("chat service should not run for invalid queries");
        },
      },
    });

    const response = await app.request("/api/chat/sessions?knowledgeBaseId=", {
      headers: {
        cookie: "better-auth.session_token=token",
        "x-request-id": "req_chat_sessions_empty_filter",
      },
    });

    expect(response.status).toBe(400);
    expect(apiErrorResponseSchema.parse(await response.json())).toMatchObject({
      code: "VALIDATION_ERROR",
      httpStatus: 400,
      requestId: "req_chat_sessions_empty_filter",
    });
  });

  it("returns a validation envelope for a non-UUID chat sessions knowledge base filter", async () => {
    const app = createApiApp({
      authService: createStaticAuthService(adminSession),
      chatService: {
        async listSessions() {
          throw new Error("chat service should not run for invalid queries");
        },
      },
    });

    const response = await app.request(
      "/api/chat/sessions?knowledgeBaseId=not-a-uuid",
      {
        headers: {
          cookie: "better-auth.session_token=token",
          "x-request-id": "req_chat_sessions_invalid_filter",
        },
      },
    );

    expect(response.status).toBe(400);
    expect(apiErrorResponseSchema.parse(await response.json())).toMatchObject({
      code: "VALIDATION_ERROR",
      httpStatus: 400,
      requestId: "req_chat_sessions_invalid_filter",
    });
  });

  it("submits a non-streaming chat question through the authenticated chat service", async () => {
    const chatService: Partial<ChatService> = {
      async submitQuestion(input) {
        expect(input.actor).toEqual(adminSession);
        expect(input.body).toEqual({
          knowledgeBaseId: "kb_1",
          question: "差旅住宿标准是多少？",
          sessionId: null,
        });
        return {
          ok: true,
          result: {
            session: sessionSummary,
            userMessage: {
              id: "msg_u",
              sessionId: SESSION_ID,
              role: "user",
              content: "差旅住宿标准是多少？",
              sequence: 1,
              createdAt: "2026-05-25T00:00:01.000Z",
              groundingLabel: null,
              retrievalRunId: null,
              citations: [],
              feedback: null,
            },
            assistantMessage,
          },
        };
      },
    };
    const app = createApiApp({
      authService: createStaticAuthService(adminSession),
      chatService,
    });

    const response = await app.request("/api/chat/messages", {
      body: JSON.stringify({
        knowledgeBaseId: "kb_1",
        question: "差旅住宿标准是多少？",
        sessionId: null,
      }),
      headers: {
        "content-type": "application/json",
        cookie: "better-auth.session_token=token",
        origin: "http://localhost:3000",
        "x-request-id": "req_chat_submit",
      },
      method: "POST",
    });

    expect(response.status).toBe(200);
    expect(
      apiSuccessResponseSchema(chatSubmitResponseSchema).parse(await response.json()),
    ).toMatchObject({
      data: {
        assistantMessage: {
          groundingLabel: "依据充分",
          citations: [{ id: "citation_1" }],
        },
      },
      requestId: "req_chat_submit",
    });
  });

  it("submits a streaming chat question as traceable SSE frames", async () => {
    const userMessage = {
      id: "msg_u",
      sessionId: SESSION_ID,
      role: "user" as const,
      content: "差旅住宿标准是多少？",
      sequence: 1,
      createdAt: "2026-05-25T00:00:01.000Z",
      groundingLabel: null,
      retrievalRunId: null,
      citations: [],
      feedback: null,
    };
    const chatService: Partial<ChatService> = {
      async *streamQuestion(input) {
        expect(input.actor).toEqual(adminSession);
        expect(input.signal).toBeInstanceOf(AbortSignal);
        expect(input.body).toEqual({
          knowledgeBaseId: "kb_1",
          question: "差旅住宿标准是多少？",
          sessionId: null,
        });
        yield {
          event: "session",
          data: {
            requestId: input.requestId,
            session: sessionSummary,
          },
        };
        yield {
          event: "user_message",
          data: {
            requestId: input.requestId,
            sessionId: SESSION_ID,
            userMessage,
          },
        };
        yield {
          event: "answer_delta",
          data: {
            delta: "差旅",
            requestId: input.requestId,
            retrievalRunId: "run_1",
            sessionId: SESSION_ID,
            userMessageId: "msg_u",
          },
        };
        yield {
          event: "answer_completed",
          data: {
            assistantMessage,
            requestId: input.requestId,
            session: sessionSummary,
          },
        };
      },
    };
    const app = createApiApp({
      authService: createStaticAuthService(adminSession),
      chatService,
    });

    const response = await app.request("/api/chat/messages/stream", {
      body: JSON.stringify({
        knowledgeBaseId: "kb_1",
        question: "差旅住宿标准是多少？",
        sessionId: null,
      }),
      headers: {
        "content-type": "application/json",
        cookie: "better-auth.session_token=token",
        origin: "http://localhost:3000",
        "x-request-id": "req_chat_stream",
      },
      method: "POST",
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(response.headers.get("x-request-id")).toBe("req_chat_stream");

    const frames = parseSseFrames(await response.text());
    expect(frames.map((frame) => frame.id)).toEqual([
      "req_chat_stream:1",
      "req_chat_stream:2",
      "req_chat_stream:3",
      "req_chat_stream:4",
    ]);
    expect(frames.map((frame) => frame.event)).toEqual([
      "session",
      "user_message",
      "answer_delta",
      "answer_completed",
    ]);
    expect(
      frames.map((frame) => chatStreamEventSchema.parse(frame.payload).event),
    ).toEqual(["session", "user_message", "answer_delta", "answer_completed"]);
  });

  it("lists persisted session messages and maps service errors safely", async () => {
    const app = createApiApp({
      authService: createStaticAuthService(adminSession),
      chatService: {
        async listMessages(input) {
          expect(input.sessionId).toBe(SESSION_ID);
          return { ok: true, result: { messages: [assistantMessage] } };
        },
      },
    });

    const response = await app.request(`/api/chat/sessions/${SESSION_ID}/messages`, {
      headers: {
        cookie: "better-auth.session_token=token",
        "x-request-id": "req_chat_messages",
      },
    });

    expect(response.status).toBe(200);
    expect(
      apiSuccessResponseSchema(chatMessagesResponseSchema).parse(await response.json())
        .data.messages[0],
    ).toMatchObject({ id: MESSAGE_ID, citations: [{ id: "citation_1" }] });
  });

  it("returns a validation envelope for non-UUID chat session message params", async () => {
    const app = createApiApp({
      authService: createStaticAuthService(adminSession),
      chatService: {
        async listMessages() {
          throw new Error("chat service should not run for invalid path params");
        },
      },
    });

    const response = await app.request("/api/chat/sessions/not-a-uuid/messages", {
      headers: {
        cookie: "better-auth.session_token=token",
        "x-request-id": "req_chat_messages_invalid_param",
      },
    });

    expect(response.status).toBe(400);
    expect(apiErrorResponseSchema.parse(await response.json())).toMatchObject({
      code: "VALIDATION_ERROR",
      httpStatus: 400,
      requestId: "req_chat_messages_invalid_param",
    });
  });

  it("submits answer feedback through a validated message path param", async () => {
    const app = createApiApp({
      authService: createStaticAuthService(adminSession),
      chatService: {
        async submitFeedback(input) {
          expect(input.messageId).toBe(MESSAGE_ID);
          expect(input.body).toEqual({
            citationIds: [],
            rating: "useful",
            reason: null,
          });
          return {
            ok: true,
            result: {
              feedback: {
                id: "feedback_1",
                messageId: MESSAGE_ID,
                rating: "useful",
                reason: null,
                citationIds: [],
                createdAt: "2026-05-25T00:00:03.000Z",
              },
            },
          };
        },
      },
    });

    const response = await app.request(
      `/api/chat/messages/${MESSAGE_ID}/feedback`,
      {
        body: JSON.stringify({ rating: "useful" }),
        headers: {
          "content-type": "application/json",
          cookie: "better-auth.session_token=token",
          origin: "http://localhost:3000",
          "x-request-id": "req_chat_feedback",
        },
        method: "POST",
      },
    );

    expect(response.status).toBe(200);
    expect(
      apiSuccessResponseSchema(submitAnswerFeedbackResponseSchema).parse(
        await response.json(),
      ),
    ).toMatchObject({
      data: { feedback: { rating: "useful" } },
      requestId: "req_chat_feedback",
    });
  });

  it("returns a validation envelope for non-UUID feedback message params", async () => {
    const app = createApiApp({
      authService: createStaticAuthService(adminSession),
      chatService: {
        async submitFeedback() {
          throw new Error("chat service should not run for invalid path params");
        },
      },
    });

    const response = await app.request(
      "/api/chat/messages/not-a-uuid/feedback",
      {
        body: JSON.stringify({ rating: "useful" }),
        headers: {
          "content-type": "application/json",
          cookie: "better-auth.session_token=token",
          origin: "http://localhost:3000",
          "x-request-id": "req_chat_feedback_invalid_param",
        },
        method: "POST",
      },
    );

    expect(response.status).toBe(400);
    expect(apiErrorResponseSchema.parse(await response.json())).toMatchObject({
      code: "VALIDATION_ERROR",
      httpStatus: 400,
      requestId: "req_chat_feedback_invalid_param",
    });
  });

  it("returns validation envelopes for invalid chat questions", async () => {
    const app = createApiApp({
      authService: createStaticAuthService(adminSession),
    });

    const response = await app.request("/api/chat/messages", {
      body: JSON.stringify({ knowledgeBaseId: "kb_1", question: "" }),
      headers: {
        "content-type": "application/json",
        cookie: "better-auth.session_token=token",
        origin: "http://localhost:3000",
        "x-request-id": "req_chat_invalid",
      },
      method: "POST",
    });

    expect(response.status).toBe(400);
    expect(apiErrorResponseSchema.parse(await response.json())).toMatchObject({
      code: "VALIDATION_ERROR",
      requestId: "req_chat_invalid",
    });
  });

  it("returns JSON validation envelopes for invalid streaming chat questions before SSE starts", async () => {
    const app = createApiApp({
      authService: createStaticAuthService(adminSession),
      chatService: {
        streamQuestion() {
          throw new Error("chat service should not run for invalid stream bodies");
        },
      },
    });

    const response = await app.request("/api/chat/messages/stream", {
      body: JSON.stringify({ knowledgeBaseId: "kb_1", question: "" }),
      headers: {
        "content-type": "application/json",
        cookie: "better-auth.session_token=token",
        origin: "http://localhost:3000",
        "x-request-id": "req_chat_stream_invalid",
      },
      method: "POST",
    });

    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(apiErrorResponseSchema.parse(await response.json())).toMatchObject({
      code: "VALIDATION_ERROR",
      requestId: "req_chat_stream_invalid",
    });
  });

  it("rejects chat mutations from disallowed origins before domain calls", async () => {
    const app = createApiApp({
      authService: createStaticAuthService(adminSession),
      chatService: {
        async submitQuestion() {
          throw new Error("chat service should not run for invalid origins");
        },
      },
    });

    const response = await app.request("/api/chat/messages", {
      body: JSON.stringify({
        knowledgeBaseId: "kb_1",
        question: "差旅住宿标准是多少？",
        sessionId: null,
      }),
      headers: {
        "content-type": "application/json",
        cookie: "better-auth.session_token=token",
        origin: "https://evil.example",
        "x-request-id": "req_chat_bad_origin",
      },
      method: "POST",
    });

    expect(response.status).toBe(403);
    expect(apiErrorResponseSchema.parse(await response.json())).toMatchObject({
      code: "FORBIDDEN",
      httpStatus: 403,
      requestId: "req_chat_bad_origin",
    });
  });

  it("rejects chat JSON mutations with unsupported content types before domain calls", async () => {
    const app = createApiApp({
      authService: createStaticAuthService(adminSession),
      chatService: {
        async submitQuestion() {
          throw new Error("chat service should not run for invalid content types");
        },
      },
    });

    const response = await app.request("/api/chat/messages", {
      body: JSON.stringify({
        knowledgeBaseId: "kb_1",
        question: "差旅住宿标准是多少？",
        sessionId: null,
      }),
      headers: {
        "content-type": "text/plain",
        cookie: "better-auth.session_token=token",
        origin: "http://localhost:3000",
        "x-request-id": "req_chat_bad_content_type",
      },
      method: "POST",
    });

    expect(response.status).toBe(415);
    expect(apiErrorResponseSchema.parse(await response.json())).toMatchObject({
      code: "UNSUPPORTED_MEDIA_TYPE",
      httpStatus: 415,
      requestId: "req_chat_bad_content_type",
    });
  });
});

function parseSseFrames(text: string): {
  event: string;
  id: string;
  payload: unknown;
}[] {
  return text
    .trim()
    .split(/\n\n/)
    .filter((frame) => frame.length > 0)
    .map((frame) => {
      const lines = frame.split(/\n/);
      const id = lines
        .find((line) => line.startsWith("id: "))
        ?.slice("id: ".length);
      const event = lines
        .find((line) => line.startsWith("event: "))
        ?.slice("event: ".length);
      const data = lines
        .find((line) => line.startsWith("data: "))
        ?.slice("data: ".length);

      if (id === undefined || event === undefined || data === undefined) {
        throw new Error("Malformed SSE frame.");
      }

      return {
        event,
        id,
        payload: {
          event,
          data: JSON.parse(data),
        },
      };
    });
}
