import { describe, expect, it, vi } from "vitest";

import {
  buildRateLimitKey,
  createInMemoryRateLimitStore,
  createRateLimiter,
  createRateLimitIdentity,
  createRedisRateLimitStore,
} from "./rate-limit";

describe("rate limiter", () => {
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
