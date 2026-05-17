import { describe, expect, it } from "vitest";

import {
  documentsListScrollClassName,
  documentsPanelClassName,
  paginateDocuments,
} from "./documents-layout";

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

  it("paginates document rows from URL page and pageSize state", () => {
    const result = paginateDocuments(["doc-1", "doc-2", "doc-3", "doc-4", "doc-5"], 2, 2);

    expect(result).toEqual({
      currentPage: 2,
      items: ["doc-3", "doc-4"],
      pageSize: 2,
      total: 5,
      totalPages: 3,
    });
  });

  it("clamps invalid document list pagination inputs to a visible page", () => {
    expect(paginateDocuments(["doc-1"], 99, 0)).toEqual({
      currentPage: 1,
      items: ["doc-1"],
      pageSize: 8,
      total: 1,
      totalPages: 1,
    });
  });
});
