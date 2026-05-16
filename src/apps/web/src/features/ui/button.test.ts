import { describe, expect, it } from "vitest";

import { buttonClassName } from "./button-styles";

describe("button styles", () => {
  it("supports inverse buttons on dark surfaces", () => {
    const className = buttonClassName("inverse");

    expect(className).toContain("bg-slate-900");
    expect(className).toContain("text-white");
    expect(className).toContain("border-white/10");
  });
});
