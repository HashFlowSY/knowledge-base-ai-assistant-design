import { describe, expect, it } from "vitest";

import { documentStatusSchema, knowledgeBaseScopeSchema } from "./index";

describe("@kb/knowledge", () => {
  it("defines knowledge-base authorization scope identifiers", () => {
    expect(
      knowledgeBaseScopeSchema.parse({
        tenantId: "tenant_1",
        knowledgeBaseId: "kb_1",
      }),
    ).toEqual({
      tenantId: "tenant_1",
      knowledgeBaseId: "kb_1",
    });
  });

  it("includes ingestion-facing document statuses", () => {
    expect(documentStatusSchema.parse("processing")).toBe("processing");
  });
});
