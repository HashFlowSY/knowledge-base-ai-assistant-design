import { describe, expect, it, vi } from "vitest";

const redirectMock = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

const { default: HomePage } = await import("./page");

describe("home page", () => {
  it("redirects direct root visits to login", () => {
    HomePage();

    expect(redirectMock).toHaveBeenCalledWith("/login");
  });
});
