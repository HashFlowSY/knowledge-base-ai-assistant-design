import { describe, expect, it } from "vitest";

import { documentsListScrollClassName, documentsPanelClassName } from "./documents-layout";

describe("documents layout", () => {
  it("uses the task page viewport height baseline for the document list", () => {
    expect(documentsPanelClassName()).toContain("xl:h-[calc(100vh-121px)]");
    expect(documentsPanelClassName()).not.toContain("xl:min-h-[calc(100vh-121px)]");
    expect(documentsPanelClassName()).toContain("xl:min-h-0");
    expect(documentsPanelClassName()).toContain("xl:flex");
    expect(documentsPanelClassName()).toContain("xl:flex-col");
    expect(documentsPanelClassName()).toContain("overflow-hidden");
    expect(documentsListScrollClassName()).toContain("xl:flex-1");
  });
});
