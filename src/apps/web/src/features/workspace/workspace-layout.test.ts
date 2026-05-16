import { describe, expect, it } from "vitest";

import {
  shouldShowKnowledgeBaseListStatus,
  workspaceContentClassName,
  workspaceKnowledgeListClassName,
  workspaceKnowledgePanelClassName,
  workspaceMetricGridClassName,
  workspaceMetricTileClassName,
  workspacePageGridClassName,
  workspaceSummaryGridClassName,
  workspaceSummaryEmptyClassName,
  workspaceSummaryListClassName,
  workspaceSummaryListItemClassName,
  workspaceVisibleDocuments,
  workspaceVisibleJobs,
  workspaceVisibleLogs,
  workspaceLogSummaryHref,
  workspaceTaskSummaryHref,
} from "./workspace-layout";

describe("workspace layout", () => {
  it("stretches the knowledge base tab to align with the workspace content bottom", () => {
    const className = workspacePageGridClassName();

    expect(className).toContain("items-stretch");
    expect(className).toContain("lg:h-[calc(100vh-121px)]");
    expect(className).not.toContain("lg:min-h-[calc(100vh-121px)]");
    expect(className).toContain("lg:grid-cols-[300px_minmax(0,1fr)]");
    expect(className).toContain("lg:[&>*]:min-h-0");
    expect(workspaceContentClassName()).toContain("lg:h-full");
    expect(workspaceContentClassName()).toContain("lg:overflow-y-auto");
  });

  it("lets the knowledge base list fill the stretched tab and scroll internally", () => {
    expect(workspaceKnowledgePanelClassName()).toContain("flex");
    expect(workspaceKnowledgePanelClassName()).toContain("h-full");
    expect(workspaceKnowledgePanelClassName()).toContain("min-h-0");
    expect(workspaceKnowledgePanelClassName()).toContain("flex-col");
    expect(workspaceKnowledgePanelClassName()).toContain("overflow-hidden");
    expect(workspaceKnowledgePanelClassName()).toContain("max-lg:max-h-[min(560px,72vh)]");
    expect(workspaceKnowledgePanelClassName()).toContain("lg:[contain:size]");

    expect(workspaceKnowledgeListClassName()).toContain("min-h-0");
    expect(workspaceKnowledgeListClassName()).toContain("flex-1");
    expect(workspaceKnowledgeListClassName()).toContain("divide-y");
  });

  it("keeps document, task, and log summary modules in one desktop row for admin users", () => {
    const className = workspaceSummaryGridClassName(true);

    expect(className).toContain("xl:grid-cols-3");
    expect(className).toContain("items-stretch");
    expect(className).toContain("[&>section]:min-h-[360px]");
    expect(className).toContain("max-lg:[&>section]:min-h-0");
  });

  it("keeps document and task summary modules in one desktop row for member users", () => {
    const className = workspaceSummaryGridClassName(false);

    expect(className).toContain("lg:grid-cols-2");
    expect(className).not.toContain("xl:grid-cols-3");
  });

  it("uses compact metric tiles in the selected knowledge base summary", () => {
    expect(workspaceMetricGridClassName()).toContain("xl:grid-cols-4");
    expect(workspaceMetricGridClassName()).toContain("gap-2");
    expect(workspaceMetricTileClassName()).toContain("px-3");
    expect(workspaceMetricTileClassName()).toContain("py-2");
  });

  it("only shows knowledge base status in the list when attention is needed", () => {
    expect(shouldShowKnowledgeBaseListStatus("ready")).toBe(false);
    expect(shouldShowKnowledgeBaseListStatus("processing")).toBe(true);
    expect(shouldShowKnowledgeBaseListStatus("failed")).toBe(true);
    expect(shouldShowKnowledgeBaseListStatus("empty")).toBe(true);
  });

  it("uses one shared row-list style for workspace summary panels", () => {
    expect(workspaceSummaryListClassName()).toContain("divide-y");
    expect(workspaceSummaryListClassName()).toContain("divide-slate-200");

    expect(workspaceSummaryListItemClassName(false)).toContain("min-h-11");
    expect(workspaceSummaryListItemClassName(false)).toContain("px-4");
    expect(workspaceSummaryListItemClassName(false)).toContain("py-3");
    expect(workspaceSummaryListItemClassName(true)).toContain("hover:bg-slate-50");
  });

  it("keeps every workspace summary row visible and delegates overflow to internal scrolling", () => {
    const rows = Array.from({ length: 8 }, (_, index) => ({ id: `row-${index + 1}` }));

    expect(workspaceVisibleDocuments(rows as Parameters<typeof workspaceVisibleDocuments>[0])).toHaveLength(8);
    expect(workspaceVisibleJobs(rows as Parameters<typeof workspaceVisibleJobs>[0])).toHaveLength(8);
    expect(workspaceVisibleLogs(rows as Parameters<typeof workspaceVisibleLogs>[0])).toHaveLength(8);
  });

  it("uses one shared empty-state wrapper for workspace summary panels", () => {
    expect(workspaceSummaryEmptyClassName()).toContain("flex");
    expect(workspaceSummaryEmptyClassName()).toContain("min-h-[120px]");
    expect(workspaceSummaryEmptyClassName()).toContain("px-4");
    expect(workspaceSummaryEmptyClassName()).toContain("py-4");
  });

  it("links workspace summary rows to the matching admin list detail", () => {
    expect(workspaceTaskSummaryHref("job-import-001")).toBe("/tasks?selectedId=job-import-001");
    expect(workspaceLogSummaryHref("log-import-001")).toBe("/logs?selectedId=log-import-001");
    expect(workspaceLogSummaryHref("log/import 001")).toBe("/logs?selectedId=log%2Fimport+001");
  });
});
