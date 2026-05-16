import { describe, expect, it } from "vitest";

import nextConfig from "./next.config";

describe("next config", () => {
  it("hides the local dev indicator so mobile drawers are not covered during review", () => {
    expect(nextConfig).toMatchObject({ devIndicators: false });
  });
});
