import { describe, expect, it } from "vitest";

import {
  chatMessagesResponseSchema,
  chatSessionsResponseSchema,
  chatSubmitResponseSchema,
} from "@kb/rag";
import { apiErrorResponseSchema, apiSuccessResponseSchema } from "@kb/shared";

import { createApiApp, type ChatService } from "../../app";
import { adminSession, createStaticAuthService } from "../../testing/fakes";

const sessionSummary = {
  id: "chat_1",
  title: "差旅制度",
  knowledgeBaseId: "kb_1",
  createdAt: "2026-05-25T00:00:00.000Z",
  updatedAt: "2026-05-25T00:00:00.000Z",
  messageCount: 2,
};

const assistantMessage = {
  id: "msg_a",
  sessionId: "chat_1",
  role: "assistant" as const,
  content: "差旅住宿标准见引用。",
  sequence: 2,
  createdAt: "2026-05-25T00:00:02.000Z",
  groundingLabel: "依据充分" as const,
  retrievalRunId: "run_1",
  citations: [
    {
      id: "citation_1",
      messageId: "msg_a",
      retrievalRunId: "run_1",
      knowledgeBaseId: "kb_1",
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
      data: { sessions: [{ id: "chat_1" }] },
      requestId: "req_chat_sessions",
    });
  });

  it("passes a valid knowledge base filter to the chat session service", async () => {
    const knowledgeBaseId = "11111111-1111-4111-8111-111111111111";
    const chatService: Partial<ChatService> = {
      async listSessions(input) {
        expect(input.query).toEqual({ knowledgeBaseId });
        return { ok: true, result: { sessions: [] } };
      },
    };
    const app = createApiApp({
      authService: createStaticAuthService(adminSession),
      chatService,
    });

    const response = await app.request(
      `/api/chat/sessions?knowledgeBaseId=${knowledgeBaseId}`,
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
              sessionId: "chat_1",
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

  it("lists persisted session messages and maps service errors safely", async () => {
    const app = createApiApp({
      authService: createStaticAuthService(adminSession),
      chatService: {
        async listMessages(input) {
          expect(input.sessionId).toBe("chat_1");
          return { ok: true, result: { messages: [assistantMessage] } };
        },
      },
    });

    const response = await app.request("/api/chat/sessions/chat_1/messages", {
      headers: {
        cookie: "better-auth.session_token=token",
        "x-request-id": "req_chat_messages",
      },
    });

    expect(response.status).toBe(200);
    expect(
      apiSuccessResponseSchema(chatMessagesResponseSchema).parse(await response.json())
        .data.messages[0],
    ).toMatchObject({ id: "msg_a", citations: [{ id: "citation_1" }] });
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
