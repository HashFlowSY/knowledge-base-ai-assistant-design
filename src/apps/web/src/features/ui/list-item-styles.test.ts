import { describe, expect, it } from "vitest";

import {
  cardActionButtonClassName,
  listActionButtonClassName,
  listActionLinkClassName,
} from "./list-item-styles";

describe("interactive list item styles", () => {
  it("keeps list links and row buttons large enough for touch targets", () => {
    expect(listActionLinkClassName()).toContain("min-h-11");
    expect(listActionButtonClassName(false)).toContain("min-h-11");
    expect(listActionButtonClassName(true)).toContain("bg-teal-50");
  });

  it("keeps card-like action rows touch friendly without changing selected state", () => {
    expect(cardActionButtonClassName(false)).toContain("min-h-11");
    expect(cardActionButtonClassName(true)).toContain("border-teal-300");
    expect(cardActionButtonClassName(false)).toContain("border-slate-200");
  });
});
