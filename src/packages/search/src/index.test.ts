import { describe, expect, it } from "vitest";

import { authorizedSearchScopeSchema } from "./index";

describe("@kb/search", () => {
  it("requires tenant and knowledge-base filters for search scopes", () => {
    expect(() =>
      authorizedSearchScopeSchema.parse({
        tenantId: "tenant_1",
        knowledgeBaseIds: [],
      }),
    ).toThrow();
  });
});
