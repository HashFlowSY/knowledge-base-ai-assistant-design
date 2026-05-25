import { describe, expect, it } from "vitest";

import { createRateLimiter } from "./limiter";
import { createInMemoryRateLimitStore } from "./stores";

describe("rate limiter", () => {
  it("returns retry metadata when the quota is exceeded", async () => {
    const limiter = createRateLimiter({
      store: createInMemoryRateLimitStore(),
      now: () => 1_000,
    });

    const first = await limiter.consume({
      identity: "ip:hash",
      limit: 1,
      scope: "user-management",
      windowLabel: "1m",
      windowMs: 60_000,
    });
    const second = await limiter.consume({
      identity: "ip:hash",
      limit: 1,
      scope: "user-management",
      windowLabel: "1m",
      windowMs: 60_000,
    });

    expect(first.allowed).toBe(true);
    expect(second).toEqual({
      allowed: false,
      key: "kbai:ratelimit:user-management:1m:ip:hash",
      retryAfterSeconds: 60,
    });
  });
});
