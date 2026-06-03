import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { apiClient } from "../../api/client";
import {
  chatMessagesQueryKey,
  chatSessionsQueryKey,
  useChatMessages,
  useSubmitChatQuestion,
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
