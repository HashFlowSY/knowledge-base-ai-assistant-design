import { describe, expect, it } from "vitest";

import { canShowDocumentProcessingLogLink } from "./document-detail-permissions";

describe("document detail permissions", () => {
  it("shows processing log navigation only to admin users", () => {
    expect(canShowDocumentProcessingLogLink("admin")).toBe(true);
    expect(canShowDocumentProcessingLogLink("member")).toBe(false);
    expect(canShowDocumentProcessingLogLink(null)).toBe(false);
  });
});
