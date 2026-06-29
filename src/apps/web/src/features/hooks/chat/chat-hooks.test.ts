import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { apiClient } from "../../api/client";
import {
  assertChatStreamResponse,
  chatMessagesQueryKey,
  chatSessionsQueryKey,
  createChatStreamEventError,
  parseChatStreamFrame,
  useChatMessages,
  useSubmitChatQuestion,
  useSubmitChatQuestionStream,
} from "./chat-hooks";

describe("chat hooks", () => {
  it("builds stable query keys for sessions and messages", () => {
    expect(chatSessionsQueryKey({ knowledgeBaseId: "kb_1" })).toEqual([
      "chat",
      "sessions",
      { knowledgeBaseId: "kb_1" },
    ]);
    expect(chatMessagesQueryKey("session_1")).toEqual(["chat", "messages", "session_1"]);
  });

  it("exposes typed chat RPC routes on the browser API client", () => {
    expect(apiClient.api.chat.sessions.$get).toBeTypeOf("function");
    expect(apiClient.api.chat.sessions.$post).toBeTypeOf("function");
    expect(apiClient.api.chat.messages.$post).toBeTypeOf("function");
    expect(apiClient.api.chat.messages[":messageId"].feedback.$post).toBeTypeOf(
      "function",
    );
  });

  it("exports chat query and mutation hooks", () => {
    expect(useChatMessages).toBeTypeOf("function");
    expect(useSubmitChatQuestion).toBeTypeOf("function");
    expect(useSubmitChatQuestionStream).toBeTypeOf("function");
  });

  it("parses traceable chat SSE frames with shared event schemas", () => {
    const frame = parseChatStreamFrame(
      [
        "id: req_1:1",
        "event: answer_delta",
        'data: {"requestId":"req_1","delta":"你好","retrievalRunId":"run_1","sessionId":"session_1","userMessageId":"msg_user"}',
      ].join("\n"),
    );

    expect(frame).toMatchObject({
      event: {
        data: {
          delta: "你好",
          requestId: "req_1",
        },
        event: "answer_delta",
      },
      id: "req_1:1",
    });
  });

  it("parses safe JSON error envelopes before SSE parsing starts", async () => {
    const response = new Response(
      JSON.stringify({
        success: false,
        httpStatus: 400,
        code: "VALIDATION_ERROR",
        message: "请检查填写内容。",
        requestId: "req_stream_invalid",
      }),
      {
        headers: {
          "content-type": "application/json",
        },
        status: 400,
      },
    );

    await expect(assertChatStreamResponse(response)).rejects.toMatchObject({
      response: {
        code: "VALIDATION_ERROR",
        message: "请检查填写内容。",
        requestId: "req_stream_invalid",
      },
    });
  });

  it("converts stream-time SSE error events into visible hook errors", () => {
    const frame = parseChatStreamFrame(
      [
        "id: req_1:5",
        "event: error",
        'data: {"requestId":"req_1","code":"PROVIDER_UNAVAILABLE","message":"模型服务暂时不可用，请稍后重试。","sessionId":"session_1","userMessageId":"msg_user","retrievalRunId":"run_1","retryable":true}',
      ].join("\n"),
    );

    if (frame.event.event !== "error") {
      throw new Error("Expected error frame.");
    }

    const error = createChatStreamEventError(frame.event);

    expect(error.name).toBe("PROVIDER_UNAVAILABLE");
    expect(error.message).toBe("模型服务暂时不可用，请稍后重试。");
  });

  it("routes stream-time SSE error events through the hook error state path", async () => {
    const source = await readFile("src/features/hooks/chat/chat-hooks.ts", "utf8");

    expect(source).toContain("throw createChatStreamEventError(event)");
    expect(source).toContain("setError(nextError)");
    expect(source).toContain("options.onError?.(nextError)");
  });

  it("does not mount mock data or import mock store in the production chat route", async () => {
    const [pageSource, featureSource] = await Promise.all([
      readFile("src/app/chat/page.tsx", "utf8"),
      readFile("src/features/chat/chat-page.tsx", "utf8"),
    ]);

    expect(pageSource).not.toContain("MockDataBoundary");
    expect(featureSource).not.toContain("../mock/");
    expect(featureSource).not.toContain("useMockStore");
  });
});
