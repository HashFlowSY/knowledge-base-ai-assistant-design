import { describe, expect, it } from "vitest";

import {
  adminListPanelClassName,
  adminListScrollClassName,
  adminPageGridClassName,
  adminRowActionClassName,
  adminRowClassName,
  adminRowMetaClassName,
  adminRowPrimaryActionClassName,
} from "./admin-list-layout";

describe("admin list layout", () => {
  it("uses the task page viewport height baseline for every admin list page", () => {
    expect(adminPageGridClassName()).toContain("xl:h-[calc(100vh-121px)]");
    expect(adminPageGridClassName()).not.toContain("xl:min-h-[calc(100vh-121px)]");
    expect(adminPageGridClassName()).toContain("items-stretch");
    expect(adminListPanelClassName()).toContain("xl:h-full");
    expect(adminListPanelClassName()).toContain("xl:min-h-0");
    expect(adminListPanelClassName()).toContain("xl:flex");
    expect(adminListPanelClassName()).toContain("xl:flex-col");
    expect(adminListPanelClassName()).toContain("overflow-hidden");
    expect(adminListScrollClassName()).toContain("xl:flex-1");
  });

  it("uses a readable two-area desktop row instead of compressed multi-column grids", () => {
    expect(adminRowClassName()).toContain("md:grid-cols-[minmax(280px,1fr)_auto]");
    expect(adminRowClassName()).not.toContain("100px");
    expect(adminRowMetaClassName()).toContain("flex-wrap");
    expect(adminRowActionClassName()).toContain("md:justify-end");
  });

  it("keeps the row primary action large enough for touch review", () => {
    expect(adminRowPrimaryActionClassName()).toContain("min-h-11");
    expect(adminRowPrimaryActionClassName()).toContain("justify-center");
    expect(adminRowPrimaryActionClassName()).toContain("text-left");
  });
});
