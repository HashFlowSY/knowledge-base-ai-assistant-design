import type {
  RateLimitConsumeInput,
  RateLimitConsumeResult,
  RateLimitKeyInput,
  RateLimitStore,
} from "./types";

export function buildRateLimitKey(input: RateLimitKeyInput): string {
  return `kbai:ratelimit:${input.scope}:${input.window}:${input.identity}`;
}

export function createRateLimiter(input: {
  store: RateLimitStore;
  now?: () => number;
}): {
  consume: (
    consumeInput: RateLimitConsumeInput,
  ) => Promise<RateLimitConsumeResult>;
} {
  const now = input.now ?? (() => Date.now());

  return {
    async consume(consumeInput) {
      const key = buildRateLimitKey({
        identity: consumeInput.identity,
        scope: consumeInput.scope,
        window: consumeInput.windowLabel,
      });
      const currentTime = now();
      const result = await input.store.increment({
        key,
        now: currentTime,
        ttlMs: consumeInput.windowMs + 30_000,
        windowMs: consumeInput.windowMs,
      });
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((result.resetAt - currentTime) / 1_000),
      );

      return {
        allowed: result.count <= consumeInput.limit,
        key,
        retryAfterSeconds,
      };
    },
  };
}
