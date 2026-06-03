import { describe, expect, it } from "vitest";

import { cardActionButtonClassName } from "./action-styles";

describe("action styles", () => {
  it("allows card action content to grow and wrap when rendered through Button", () => {
    const className = cardActionButtonClassName(false);

    expect(className).toContain("h-auto");
    expect(className).toContain("whitespace-normal");
    expect(className).toContain("break-words");
  });
});
