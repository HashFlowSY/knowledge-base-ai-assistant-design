import { describe, expect, it, vi } from "vitest";

import { createRedisRateLimitStore } from "./stores";

describe("rate-limit stores", () => {
  it("uses a single Redis script call for atomic fixed-window increments", async () => {
    const redis = {
      eval: vi.fn(async () => [2, 61_000]),
    };
    const store = createRedisRateLimitStore(redis as never);

    const result = await store.increment({
      key: "kbai:ratelimit:auth:1m:ip:hash",
      now: 1_000,
      ttlMs: 90_000,
      windowMs: 60_000,
    });

    expect(result).toEqual({ count: 2, resetAt: 61_000 });
    expect(redis.eval).toHaveBeenCalledTimes(1);
    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call"),
      1,
      "kbai:ratelimit:auth:1m:ip:hash",
      "1000",
      "60000",
      "90000",
    );
  });
});
