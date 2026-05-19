import { describe, expect, it } from "vitest";

import {
  betterAuthDatabaseOptions,
  createBetterAuthDrizzleAdapterConfig,
  createBetterAuthRuntime,
  extractSetCookieHeaders,
} from "./server";

describe("@kb/auth runtime", () => {
  it("maps Better Auth models and password field to project Drizzle schema keys", () => {
    expect(betterAuthDatabaseOptions.user?.modelName).toBe("authUsers");
    expect(betterAuthDatabaseOptions.session?.modelName).toBe("authSessions");
    expect(betterAuthDatabaseOptions.account?.modelName).toBe("authAccounts");
    expect(betterAuthDatabaseOptions.verification?.modelName).toBe(
      "authVerifications",
    );
    expect(betterAuthDatabaseOptions.account?.fields?.password).toBe("passwordHash");
  });

  it("extracts every Set-Cookie header from Better Auth responses", () => {
    const headers = new Headers();
    headers.append(
      "Set-Cookie",
      "better-auth.session_token=abc; HttpOnly; SameSite=Lax",
    );
    headers.append(
      "Set-Cookie",
      "better-auth.session_data=def; HttpOnly; SameSite=Lax",
    );

    expect(extractSetCookieHeaders(headers)).toEqual([
      "better-auth.session_token=abc; HttpOnly; SameSite=Lax",
      "better-auth.session_data=def; HttpOnly; SameSite=Lax",
    ]);
  });

  it("builds a Drizzle adapter config with the caller-provided schema", () => {
    const schema = {
      authAccounts: {},
      authSessions: {},
      authUsers: {},
      authVerifications: {},
    };

    expect(createBetterAuthDrizzleAdapterConfig(schema)).toEqual({
      provider: "pg",
      schema,
    });
  });

  it("creates a Better Auth runtime with email/password enabled", () => {
    const schema = {
      authAccounts: {},
      authSessions: {},
      authUsers: {},
      authVerifications: {},
    };

    const runtime = createBetterAuthRuntime({
      appBaseUrl: "http://localhost:3000",
      db: {} as never,
      schema,
      secret: "0123456789abcdef0123456789abcdef",
    });

    expect(runtime.options.emailAndPassword?.enabled).toBe(true);
    expect(runtime.options.basePath).toBe("/api/_better-auth");
    expect(runtime.handler).toBeTypeOf("function");
    expect(runtime.api.signInEmail).toBeTypeOf("function");
  });
});
