import { describe, expect, it } from "vitest";

import { scrollAreaClassName } from "./scroll-area";

describe("scroll area styles", () => {
  it("keeps overflowing module content inside a bounded scroll container", () => {
    expect(scrollAreaClassName("md")).toContain("overflow-y-auto");
    expect(scrollAreaClassName("md")).toContain("max-h-[min(420px,70vh)]");
    expect(scrollAreaClassName("lg", "divide-y divide-slate-200")).toContain("divide-y divide-slate-200");
    expect(scrollAreaClassName("fill")).toContain("max-h-none");
  });
});
