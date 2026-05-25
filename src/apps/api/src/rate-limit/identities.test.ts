import { describe, expect, it } from "vitest";

import { createRateLimitIdentity } from "./identities";
import { buildRateLimitKey } from "./limiter";

describe("rate-limit identities", () => {
  it("builds Redis-compatible keys without raw identifiers or secrets", async () => {
    const identity = await createRateLimitIdentity({
      kind: "login",
      email: " Admin@Example.COM ",
      ipSummary: "203.0.113.0/24",
    });

    const key = buildRateLimitKey({
      identity,
      scope: "auth",
      window: "15m",
    });

    expect(key).toMatch(/^kbai:ratelimit:auth:15m:ip:[a-f0-9]{64}:email:[a-f0-9]{64}$/);
    expect(key).not.toContain("Admin");
    expect(key).not.toContain("203.0.113");
    expect(key.length).toBeLessThan(200);
  });

  it("uses hashed session cookies for session/logout auth identities", async () => {
    const identity = await createRateLimitIdentity({
      kind: "session",
      ipSummary: "203.0.113.0/24",
      sessionCookie: "better-auth-secret-token",
    });

    expect(identity).toMatch(/^session:[a-f0-9]{64}$/);
    expect(identity).not.toContain("better-auth-secret-token");
  });
});
