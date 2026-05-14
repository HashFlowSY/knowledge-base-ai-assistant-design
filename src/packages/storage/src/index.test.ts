import { describe, expect, it } from "vitest";

import { createDocumentObjectKey } from "./index";

describe("@kb/storage", () => {
  it("creates server-owned document object keys", () => {
    expect(
      createDocumentObjectKey({
        tenantId: "tenant_1",
        documentId: "doc_1",
        fileName: "source.pdf",
      }),
    ).toBe("tenants/tenant_1/documents/doc_1/source.pdf");
  });
});
