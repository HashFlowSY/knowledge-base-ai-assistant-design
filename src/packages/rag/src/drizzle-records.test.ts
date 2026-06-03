import { describe, expect, it } from "vitest";

import type { chatSessions } from "@kb/db";

import { mapSession } from "./drizzle-records";
import { chatSessionSummarySchema } from "./types";

type ChatSessionRow = typeof chatSessions.$inferSelect;

describe("RAG drizzle record mappers", () => {
  it("normalizes PostgreSQL count values before returning session summaries", () => {
    const summary = mapSession(
      createSessionRow(),
      "2" as unknown as number,
    );

    expect(chatSessionSummarySchema.parse(summary).messageCount).toBe(2);
  });
});

function createSessionRow(): ChatSessionRow {
  return {
    createdAt: new Date("2026-05-25T00:00:00.000Z"),
    deletedAt: null,
    id: "session_1",
    metadata: {},
    selectedKnowledgeBaseIds: ["kb_1"],
    tenantId: "tenant_1",
    title: "差旅制度",
    updatedAt: new Date("2026-05-25T00:00:01.000Z"),
    userId: "user_1",
  };
}
