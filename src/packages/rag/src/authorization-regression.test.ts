import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("RAG knowledge-base authorization regression guards", () => {
  it("reuses knowledge package visibility rules instead of duplicating membership SQL", () => {
    const runsSource = readFileSync(
      new URL("./drizzle-runs.ts", import.meta.url),
      "utf8",
    );

    expect(runsSource).toContain("@kb/knowledge/permissions");
    expect(runsSource).not.toContain("knowledgeBaseMembers");
  });

  it("centralizes current KB visibility checks for chat session access", () => {
    const repositorySource = readFileSync(
      new URL("./drizzle-repository.ts", import.meta.url),
      "utf8",
    );
    const accessSource = readFileSync(
      new URL("./drizzle-chat-access.ts", import.meta.url),
      "utf8",
    );

    expect(repositorySource).toContain("createAccessibleChatSessionConditions");
    expect(accessSource).toContain("createVisibleKnowledgeBaseConditions");
    expect(accessSource).toContain("selectedKnowledgeBaseContainsVisibleKnowledgeBase()");
  });

  it("limits session ownership checks to members so admins keep tenant-wide chat visibility", () => {
    const accessSource = readFileSync(
      new URL("./drizzle-chat-access.ts", import.meta.url),
      "utf8",
    );

    expect(accessSource).toContain('if (input.actor.role === "member")');
    expect(accessSource).toContain(
      "conditions.push(eq(chatSessions.userId, input.actor.user.id));",
    );
  });
});
