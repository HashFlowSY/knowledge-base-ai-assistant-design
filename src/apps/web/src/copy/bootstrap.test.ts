import { describe, expect, it } from "vitest";

import { bootstrapCopy } from "./bootstrap";

describe("@kb/web copy", () => {
  it("centralizes Chinese bootstrap page copy", () => {
    expect(bootstrapCopy.title).toBe("知识库 AI 助手");
    expect(bootstrapCopy.statusItems).toHaveLength(3);
  });
});
