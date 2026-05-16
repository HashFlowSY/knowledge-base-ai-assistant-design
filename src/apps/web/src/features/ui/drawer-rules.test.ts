import { describe, expect, it } from "vitest";

import { shouldShowDrawerCloseButton } from "./drawer-rules";

describe("drawer rules", () => {
  it("does not expose a close button inside detail pages", () => {
    expect(shouldShowDrawerCloseButton()).toBe(false);
  });
});
