import Redis from "ioredis";

import type { RateLimitStore } from "./types";

const redisFixedWindowIncrementScript = `
local raw = redis.call("GET", KEYS[1])
local now = tonumber(ARGV[1])
local window_ms = tonumber(ARGV[2])
local ttl_ms = tonumber(ARGV[3])
local ttl_buffer_ms = math.max(0, ttl_ms - window_ms)

if raw then
  local ok, current = pcall(cjson.decode, raw)
  if ok and type(current) == "table" then
    local count = tonumber(current["count"])
    local reset_at = tonumber(current["resetAt"])
    if count and reset_at and reset_at > now then
      local next_count = count + 1
      local next_ttl = math.max(1, reset_at - now + ttl_buffer_ms)
      redis.call("PSETEX", KEYS[1], next_ttl, cjson.encode({ count = next_count, resetAt = reset_at }))
      return { next_count, reset_at }
    end
  end
end

local reset_at = now + window_ms
redis.call("PSETEX", KEYS[1], ttl_ms, cjson.encode({ count = 1, resetAt = reset_at }))
return { 1, reset_at }
`;

export function createInMemoryRateLimitStore(): RateLimitStore {
  const counters = new Map<string, { count: number; resetAt: number }>();

  return {
    async increment(input) {
      const existing = counters.get(input.key);
      if (existing === undefined || existing.resetAt <= input.now) {
        const next = { count: 1, resetAt: input.now + input.windowMs };
        counters.set(input.key, next);
        return next;
      }

      const next = {
        count: existing.count + 1,
        resetAt: existing.resetAt,
      };
      counters.set(input.key, next);
      return next;
    },
  };
}

export function createRedisRateLimitStore(redis: Redis): RateLimitStore {
  return {
    async increment(input) {
      const result = await redis.eval(
        redisFixedWindowIncrementScript,
        1,
        input.key,
        input.now.toString(),
        input.windowMs.toString(),
        input.ttlMs.toString(),
      );

      return parseRedisScriptResult(result, input);
    },
  };
}

export function createRedisClient(redisUrl: string): Redis {
  return new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });
}

function parseRedisScriptResult(
  value: unknown,
  fallback: { now: number; windowMs: number },
): { count: number; resetAt: number } {
  if (Array.isArray(value)) {
    const countValue = value[0];
    const resetAtValue = value[1];
    const countNumber =
      typeof countValue === "number"
        ? countValue
        : Number.parseInt(String(countValue), 10);
    const resetAtNumber =
      typeof resetAtValue === "number"
        ? resetAtValue
        : Number.parseInt(String(resetAtValue), 10);

    if (
      Number.isInteger(countNumber) &&
      countNumber > 0 &&
      Number.isFinite(resetAtNumber)
    ) {
      return {
        count: countNumber,
        resetAt: resetAtNumber,
      };
    }
  }

  return {
    count: 1,
    resetAt: fallback.now + fallback.windowMs,
  };
}
