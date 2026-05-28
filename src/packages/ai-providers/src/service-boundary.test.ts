import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("@kb/ai-providers service module boundary", () => {
  it("keeps the public service entrypoint as a small compatibility barrel", () => {
    const source = readFileSync("src/service.ts", "utf8");
    const sourceLines = source.split("\n").length;

    expect(sourceLines).toBeLessThanOrEqual(200);
    expect(source).not.toContain("from \"drizzle-orm\"");
    expect(source).not.toContain("from \"zod\"");
    expect(source).not.toContain("from \"@kb/db\"");
    expect(source).not.toContain("from \"@kb/security\"");
  });
});
