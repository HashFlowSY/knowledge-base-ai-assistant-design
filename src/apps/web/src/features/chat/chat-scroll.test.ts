import { describe, expect, it } from "vitest";

import { getTopAlignedScrollTop } from "./chat-scroll";

describe("chat citation scrolling", () => {
  it("aligns the active card to the top even when it is already visible", () => {
    expect(
      getTopAlignedScrollTop({
        containerTop: 100,
        currentScrollTop: 240,
        targetTop: 180,
      }),
    ).toBe(320);
  });

  it("aligns upward only inside the citation panel when the active card is above view", () => {
    expect(
      getTopAlignedScrollTop({
        containerTop: 100,
        currentScrollTop: 240,
        targetTop: 40,
      }),
    ).toBe(180);
  });

  it("aligns downward only inside the citation panel when the active card is below view", () => {
    expect(
      getTopAlignedScrollTop({
        containerTop: 100,
        currentScrollTop: 240,
        targetTop: 540,
      }),
    ).toBe(680);
  });

  it("does not produce a negative scroll position near the top of the list", () => {
    expect(
      getTopAlignedScrollTop({
        containerTop: 100,
        currentScrollTop: 20,
        targetTop: 40,
      }),
    ).toBe(0);
  });
});
