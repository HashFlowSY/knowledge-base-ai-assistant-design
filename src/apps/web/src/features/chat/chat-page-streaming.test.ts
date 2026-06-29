import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("ChatPage streaming integration contract", () => {
  it("keeps streaming state local and wires session, cancel, and persisted citation behavior", async () => {
    const source = await readFile("src/features/chat/chat-page.tsx", "utf8");

    expect(source).toContain("useSubmitChatQuestionStream");
    expect(source).toContain("event.event === \"session\"");
    expect(source).toContain("sessionId: event.data.session.id");
    expect(source).toContain("userMessagePersisted");
    expect(source).toContain("handleTemporaryStreamStop");
    expect(source).toContain("assistantMessage: null");
    expect(source).toContain("citationPanelAnswer");
    expect(source).not.toContain("localStorage");
    expect(source).not.toContain("createContext");
  });
});
