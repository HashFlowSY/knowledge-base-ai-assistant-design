import { describe, expect, it } from "vitest";

import {
  workspaceContentClassName,
  workspaceKnowledgeListClassName,
  workspaceKnowledgePanelClassName,
  workspaceMetricGridClassName,
  workspaceMetricTileClassName,
  workspacePageGridClassName,
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

  it("uses compact metric tiles in the selected knowledge base summary", () => {
    expect(workspaceMetricGridClassName()).toContain("xl:grid-cols-4");
    expect(workspaceMetricGridClassName()).toContain("gap-2");
    expect(workspaceMetricTileClassName()).toContain("px-3");
    expect(workspaceMetricTileClassName()).toContain("py-2");
  });
});
