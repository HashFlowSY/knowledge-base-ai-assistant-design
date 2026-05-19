import { describe, expect, it } from "vitest";

import nextConfig from "./next.config";

describe("next config", () => {
  it("hides the local dev indicator so mobile drawers are not covered during review", () => {
    expect(nextConfig).toMatchObject({ devIndicators: false });
  });

  it("rewrites same-origin API requests to the local Hono API in development", async () => {
    await expect(nextConfig.rewrites?.()).resolves.toEqual([
      {
        source: "/api/:path*",
        destination: "http://localhost:4000/api/:path*",
      },
    ]);
  });
});
