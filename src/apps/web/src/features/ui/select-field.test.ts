import { describe, expect, it } from "vitest";

import { selectFieldMenuClassName, selectFieldTriggerClassName } from "./select-field-styles";

describe("select field styles", () => {
  it("opens options below the trigger instead of overlaying the closed field", () => {
    expect(selectFieldTriggerClassName()).toContain("min-h-11");
    expect(selectFieldTriggerClassName()).toContain("w-full");
    expect(selectFieldMenuClassName()).toContain("absolute");
    expect(selectFieldMenuClassName()).toContain("top-[calc(100%+4px)]");
    expect(selectFieldMenuClassName()).toContain("z-50");
  });

  it("can open options above the trigger for bottom-pinned controls", () => {
    expect(selectFieldMenuClassName("default", "top")).toContain("bottom-[calc(100%+4px)]");
    expect(selectFieldMenuClassName("default", "top")).not.toContain("top-[calc(100%+4px)]");
  });
});
