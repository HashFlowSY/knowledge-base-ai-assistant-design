import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("chat panels", () => {
  it("wires a visible error state when sessions cannot be loaded", async () => {
    const [pageSource, panelSource, copySource] = await Promise.all([
      readFile("src/features/chat/chat-page.tsx", "utf8"),
      readFile("src/features/chat/chat-panels.tsx", "utf8"),
      readFile("src/copy/chat.ts", "utf8"),
    ]);

    expect(pageSource).toContain("isError={sessionsQuery.isError}");
    expect(panelSource).toContain("isError");
    expect(panelSource).toContain("chatCopy.sessionsFailed");
    expect(copySource).toContain("sessionsFailed");
  });

  it("renders chat and citation items inside spaced scroll content wrappers", async () => {
    const [pageSource, panelSource] = await Promise.all([
      readFile("src/features/chat/chat-page.tsx", "utf8"),
      readFile("src/features/chat/chat-panels.tsx", "utf8"),
    ]);

    expect(pageSource).toContain("chatMessageScrollContentClassName");
    expect(panelSource).toContain("chatCitationScrollContentClassName");
  });

  it("scrolls the citation verification panel when an answer citation is selected", async () => {
    const panelSource = await readFile("src/features/chat/chat-panels.tsx", "utf8");

    expect(panelSource).toContain("scrollElementIntoContainerView");
    expect(panelSource).toContain("activeCitationButtonRef");
    expect(panelSource).toContain("citationContentRef");
    expect(panelSource).toContain("citationViewportRef");
    expect(panelSource).toContain("viewportRef={citationViewportRef}");
    expect(panelSource).not.toContain("parentElement");
  });
});
