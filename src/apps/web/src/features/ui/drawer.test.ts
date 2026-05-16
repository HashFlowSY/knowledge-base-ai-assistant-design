import { describe, expect, it } from "vitest";

import { drawerBodyClassName, drawerClassName, drawerHeaderClassName } from "./drawer-styles";

describe("drawer styles", () => {
  it("keeps mobile drawers bounded and scrolls content inside the body", () => {
    expect(drawerClassName()).toContain("max-h-[72vh]");
    expect(drawerClassName()).toContain("z-50");
    expect(drawerBodyClassName()).toContain("overflow-y-auto");
    expect(drawerBodyClassName()).toContain("min-h-0");
  });

  it("keeps desktop drawer content internally scrollable instead of stretching the side panel", () => {
    expect(drawerClassName()).toContain("min-h-0");
    expect(drawerClassName()).toContain("lg:h-full");
    expect(drawerClassName()).toContain("lg:flex-1");
    expect(drawerClassName()).toContain("lg:max-h-full");
    expect(drawerClassName()).not.toContain("lg:max-h-[calc(100vh-160px)]");
    expect(drawerClassName()).not.toContain("lg:h-[calc(100vh-160px)]");
    expect(drawerClassName()).toContain("lg:overflow-hidden");
    expect(drawerHeaderClassName()).toContain("shrink-0");
    expect(drawerBodyClassName()).toContain("flex-1");
    expect(drawerBodyClassName()).toContain("lg:overflow-y-auto");
    expect(drawerBodyClassName()).not.toContain("lg:overflow-visible");
  });
});
