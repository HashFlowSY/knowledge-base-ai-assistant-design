import { describe, expect, it } from "vitest";

import { getLoginRedirectTarget } from "./login-redirect";

describe("login redirect decision", () => {
  it("returns no render-time redirect while session is loading or absent", () => {
    expect(
      getLoginRedirectTarget({
        isLoading: true,
        redirectTo: "/workspace",
        session: undefined,
      }),
    ).toBeNull();
    expect(getLoginRedirectTarget({ isLoading: false, redirectTo: "/workspace", session: null })).toBeNull();
  });

  it("returns the redirect target only for authenticated sessions", () => {
    expect(
      getLoginRedirectTarget({
        isLoading: false,
        redirectTo: "/workspace",
        session: {
          user: { id: "user_1", name: "管理员", email: "admin@example.com" },
          tenant: { id: "tenant_1" },
          role: "admin",
        },
      }),
    ).toBe("/workspace");
  });

  it("sanitizes redirectTo to internal non-login paths", async () => {
    const { sanitizeRedirectTo } = await import("./login-redirect");

    expect(sanitizeRedirectTo("/users?page=1")).toBe("/users?page=1");
    expect(sanitizeRedirectTo("https://example.com")).toBe("/workspace");
    expect(sanitizeRedirectTo("//example.com")).toBe("/workspace");
    expect(sanitizeRedirectTo("/login")).toBe("/workspace");
  });
});
