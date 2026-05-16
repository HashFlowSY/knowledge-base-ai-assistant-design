import { describe, expect, it } from "vitest";

import { getLoginRedirectTarget } from "./login-redirect";

describe("login redirect decision", () => {
  it("returns no render-time redirect before hydration or when login is allowed", () => {
    expect(
      getLoginRedirectTarget({
        hydrated: false,
        routeAccess: { allowed: false, redirectTo: "/workspace", reason: "already_authenticated" },
      }),
    ).toBeNull();
    expect(getLoginRedirectTarget({ hydrated: true, routeAccess: { allowed: true } })).toBeNull();
  });

  it("returns the redirect target only for hydrated authenticated login access", () => {
    expect(
      getLoginRedirectTarget({
        hydrated: true,
        routeAccess: { allowed: false, redirectTo: "/workspace", reason: "already_authenticated" },
      }),
    ).toBe("/workspace");
  });
});
