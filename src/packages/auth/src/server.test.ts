import { describe, expect, it } from "vitest";

import { hashPasswordForAccount } from "./server";

describe("@kb/auth/server", () => {
  it("keeps password hashing behind the server-only entrypoint", async () => {
    const hash = await hashPasswordForAccount("password123");

    expect(hash).not.toBe("password123");
  });
});
