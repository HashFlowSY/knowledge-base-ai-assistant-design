import { describe, expect, it } from "vitest";

import { createApiRuntimeServices } from "./runtime-services";

describe("api runtime services", () => {
  it("wires auth service, user service, and rate limiter from runtime config", async () => {
    const runtime = createApiRuntimeServices({
      appBaseUrl: "http://localhost:3000",
      betterAuthSecret: "0123456789abcdef0123456789abcdef",
      databaseUrl: "postgres://kb:kb@localhost:5432/kb",
      redisUrl: "redis://localhost:6379",
    });

    expect(runtime.allowedOrigins).toEqual(["http://localhost:3000"]);
    expect(runtime.authService.getSession).toBeTypeOf("function");
    expect(runtime.userService.createUser).toBeTypeOf("function");
    expect(runtime.rateLimiter.consume).toBeTypeOf("function");

    await runtime.close();
  });
});
