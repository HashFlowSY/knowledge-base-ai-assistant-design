import { describe, expect, it } from "vitest";

import {
  documentChunkDetailScrollClassName,
  documentChunkPlaceholderClassName,
  documentDetailExitHref,
  documentDetailHeaderActionsClassName,
  documentDetailLogHref,
  documentDetailMainClassName,
  documentDetailPageGridClassName,
  documentDetailRelatedLogIds,
  documentDetailSideClassName,
  documentDetailTaskHref,
  latestDocumentLogId,
  documentProcessingSummaryScrollClassName,
} from "./document-detail-layout";

describe("document detail layout", () => {
  it("provides a stable page-level exit action back to the document list", () => {
    expect(documentDetailExitHref()).toBe("/documents");
    expect(documentDetailHeaderActionsClassName()).toContain("flex");
    expect(documentDetailHeaderActionsClassName()).toContain("flex-wrap");
    expect(documentDetailHeaderActionsClassName()).toContain("gap-2");
  });

  it("deep links from document detail to the related task and latest log detail", () => {
    expect(documentDetailTaskHref(["job-import-001"])).toBe("/tasks?selectedId=job-import-001");
    expect(documentDetailTaskHref(["job/import 001"])).toBe("/tasks?selectedId=job%2Fimport+001");
    expect(documentDetailTaskHref([])).toBe("/tasks");

    expect(
      documentDetailRelatedLogIds(
        [
          { id: "job-import-001", logIds: ["log-import-001", "log-import-002"] },
          { id: "job-other-001", logIds: ["log-other-001"] },
        ],
        ["job-import-001"],
      ),
    ).toEqual(["log-import-001", "log-import-002"]);
    expect(
      latestDocumentLogId(
        [
          { createdAt: "2026-05-10T08:17:00.000Z", id: "log-import-001" },
          { createdAt: "2026-05-10T08:18:00.000Z", id: "log-import-002" },
        ],
        ["log-import-001", "log-import-002"],
      ),
    ).toBe("log-import-002");
    expect(documentDetailLogHref("log-import-002")).toBe("/logs?selectedId=log-import-002");
    expect(documentDetailLogHref(null)).toBe("/logs");
  });

  it("uses the task page viewport height baseline for the document detail page", () => {
    expect(documentDetailPageGridClassName()).toContain("xl:h-[calc(100vh-121px)]");
    expect(documentDetailPageGridClassName()).not.toContain("xl:min-h-[calc(100vh-121px)]");
    expect(documentDetailPageGridClassName()).toContain("xl:grid-cols-[minmax(0,1fr)_360px]");
    expect(documentDetailPageGridClassName()).toContain("xl:[&>*]:min-h-0");
    expect(documentDetailMainClassName()).toContain("xl:h-full");
    expect(documentDetailMainClassName()).toContain("xl:overflow-y-auto");
    expect(documentDetailSideClassName()).toContain("xl:h-full");
    expect(documentDetailSideClassName()).toContain("xl:min-h-0");
    expect(documentDetailSideClassName()).toContain("xl:flex");
    expect(documentDetailSideClassName()).toContain("xl:flex-col");
    expect(documentDetailSideClassName()).toContain("xl:overflow-hidden");
    expect(documentChunkPlaceholderClassName()).toContain("xl:flex-1");
    expect(documentChunkPlaceholderClassName()).toContain("xl:min-h-0");
    expect(documentChunkPlaceholderClassName()).toContain("xl:overflow-hidden");
  });

  it("keeps side panel scroll content horizontally balanced", () => {
    expect(documentProcessingSummaryScrollClassName()).toContain("pl-4");
    expect(documentProcessingSummaryScrollClassName()).toContain("pr-4");
    expect(documentProcessingSummaryScrollClassName()).not.toContain("p-4");

    expect(documentChunkDetailScrollClassName()).toContain("pl-4");
    expect(documentChunkDetailScrollClassName()).toContain("pr-4");
  });
});
