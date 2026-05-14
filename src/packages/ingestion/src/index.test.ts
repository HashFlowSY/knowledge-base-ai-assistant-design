import { describe, expect, it } from "vitest";

import { ingestionJobStateSchema } from "./index";

describe("@kb/ingestion", () => {
  it("tracks persisted job state identifiers and current step", () => {
    expect(
      ingestionJobStateSchema.parse({
        tenantId: "tenant_1",
        knowledgeBaseId: "kb_1",
        documentId: "doc_1",
        status: "processing",
        currentStep: "chunk",
      }).currentStep,
    ).toBe("chunk");
  });
});
