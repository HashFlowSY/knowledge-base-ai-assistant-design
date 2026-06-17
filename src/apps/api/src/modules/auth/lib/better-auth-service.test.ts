import { describe, expect, it, vi } from "vitest";

import type { SessionPayload } from "@kb/auth";
import type { BetterAuthRuntime } from "@kb/auth/server";
import type { ProjectDb } from "@kb/db";
import { isAppError } from "@kb/errors";
import type { LogRecord } from "@kb/observability";

const { createBetterAuthServiceFromRuntime } = await import(
  "./better-auth-service"
);

const sessionPayload: SessionPayload = {
  user: {
    id: "user_1",
    name: "管理员",
    email: "admin@example.com",
  },
  tenant: { id: "tenant_1" },
  role: "admin",
};

describe("Better Auth API service", () => {
  it("throws forbidden with Set-Cookie cleanup when signed-in user lacks default tenant access", async () => {
    const signInEmail = vi.fn(async () => ({
      response: {
        token: "session_token",
        user: sessionPayload.user,
      },
      headers: createSetCookieHeaders(
        "better-auth.session_token=session_token; HttpOnly; SameSite=Lax",
      ),
    }));
    const signOut = vi.fn(async () => ({
      response: { success: true },
      headers: createSetCookieHeaders(
        "better-auth.session_token=; Max-Age=0; HttpOnly; SameSite=Lax",
      ),
    }));
    const resolveSessionPayload = vi.fn(async () => ({
      ok: false as const,
      reason: "access_removed" as const,
    }));
    const service = createBetterAuthServiceFromRuntime({
      db: {} as ProjectDb,
      resolveSessionPayload,
      runtime: createRuntime({ signInEmail, signOut }),
    });

    let caughtError: unknown;
    try {
      await service.login({
        email: "admin@example.com",
        password: "password123",
      });
    } catch (error) {
      caughtError = error;
    }

    expect(resolveSessionPayload).toHaveBeenCalledWith(
      expect.anything(),
      { user: sessionPayload.user },
    );
    expect(isAppError(caughtError)).toBe(true);
    if (!isAppError(caughtError)) {
      throw new Error("expected AppError");
    }
    expect(caughtError.data).toMatchObject({
      code: "FORBIDDEN",
      domain: "auth",
      httpStatus: 403,
      reason: "access_removed",
      responseHeaders: {
        setCookie: [
          "better-auth.session_token=; Max-Age=0; HttpOnly; SameSite=Lax",
        ],
      },
    });
    expect(signInEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        body: {
          email: "admin@example.com",
          password: "password123",
        },
        returnHeaders: true,
      }),
    );
    expect(signOut).toHaveBeenCalledWith(
      expect.objectContaining({
        returnHeaders: true,
      }),
    );
    const signOutCalls = signOut.mock.calls as unknown as [
      { headers: Headers },
    ][];
    const signOutInput = signOutCalls[0]?.[0];
    expect(signOutInput?.headers.get("cookie")).toBe(
      "better-auth.session_token=session_token",
    );
    expect(caughtError.message).toBe(
      "当前账号无权访问默认租户，请联系管理员。",
    );
  });

  it("throws internal error after login when the default tenant cannot be resolved", async () => {
    const signInEmail = vi.fn(async () => ({
      response: {
        token: "session_token",
        user: sessionPayload.user,
      },
      headers: createSetCookieHeaders(
        "better-auth.session_token=session_token; HttpOnly; SameSite=Lax",
      ),
    }));
    const signOut = vi.fn();
    const resolveSessionPayload = vi.fn(async () => ({
      ok: false as const,
      reason: "default_tenant_unavailable" as const,
    }));
    const service = createBetterAuthServiceFromRuntime({
      db: {} as ProjectDb,
      resolveSessionPayload,
      runtime: createRuntime({ signInEmail, signOut }),
    });

    await expect(
      service.login({
        email: "admin@example.com",
        password: "password123",
      }),
    ).rejects.toMatchObject({
      data: {
        code: "INTERNAL_ERROR",
        domain: "auth",
        httpStatus: 500,
        reason: "default_tenant_unavailable",
      },
    });

    expect(signOut).not.toHaveBeenCalled();
  });

  it("throws forbidden without cleanup response headers when sign-out returns none", async () => {
    const signInEmail = vi.fn(async () => ({
      response: {
        token: "session_token",
        user: sessionPayload.user,
      },
      headers: createSetCookieHeaders(
        "better-auth.session_token=session_token; HttpOnly; SameSite=Lax",
      ),
    }));
    const signOut = vi.fn(async () => ({
      response: { success: true },
      headers: new Headers(),
    }));
    const resolveSessionPayload = vi.fn(async () => ({
      ok: false as const,
      reason: "access_removed" as const,
    }));
    const service = createBetterAuthServiceFromRuntime({
      db: {} as ProjectDb,
      resolveSessionPayload,
      runtime: createRuntime({ signInEmail, signOut }),
    });

    let caughtError: unknown;
    try {
      await service.login({
        email: "admin@example.com",
        password: "password123",
      });
    } catch (error) {
      caughtError = error;
    }

    expect(isAppError(caughtError)).toBe(true);
    if (!isAppError(caughtError)) {
      throw new Error("expected AppError");
    }
    expect(caughtError.data).toMatchObject({
      code: "FORBIDDEN",
      domain: "auth",
      httpStatus: 403,
      reason: "access_removed",
    });
    expect(caughtError.data.responseHeaders).toBeUndefined();
  });

  it("logs safe messages when Better Auth runtime throws secret-bearing errors", async () => {
    const stdout = captureStdoutWrites();
    const service = createBetterAuthServiceFromRuntime({
      db: {} as ProjectDb,
      runtime: createRuntime({
        getSession: vi.fn(async () => {
          throw new Error("session cookie=better-auth.session_token=secret_token");
        }),
        signInEmail: vi.fn(async () => {
          throw new Error("login password=secret requestBody={} token=secret_token");
        }),
        signOut: vi.fn(async () => {
          throw new Error("logout cookie=better-auth.session_token=secret_token");
        }),
      }),
    });

    try {
      await expect(
        service.login({
          email: "admin@example.com",
          password: "password123",
        }),
      ).rejects.toMatchObject({
        data: {
          code: "INTERNAL_ERROR",
          domain: "auth",
          httpStatus: 500,
          reason: "unexpected_error",
        },
      });
      await expect(
        service.logout({
          cookieHeader: "better-auth.session_token=session_token",
        }),
      ).resolves.toEqual({ ok: true });
      await expect(
        service.getSession({
          cookieHeader: "better-auth.session_token=session_token",
        }),
      ).rejects.toMatchObject({
        data: {
          code: "INTERNAL_ERROR",
          domain: "auth",
          httpStatus: 500,
          reason: "unexpected_error",
        },
      });
    } finally {
      stdout.restore();
    }

    const records = parseLogRecords(stdout.writes);
    expect(records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "auth_login_failed",
          fields: {
            error: "Auth login failed.",
          },
        }),
        expect.objectContaining({
          event: "auth_logout_failed",
          fields: {
            error: "Auth logout failed.",
          },
        }),
        expect.objectContaining({
          event: "auth_session_failed",
          fields: {
            error: "Auth session lookup failed.",
          },
        }),
      ]),
    );
    expect(JSON.stringify(records)).not.toContain("secret_token");
    expect(JSON.stringify(records)).not.toContain("requestBody");
    expect(JSON.stringify(records)).not.toContain("password=secret");
    expect(JSON.stringify(records)).not.toContain("better-auth.session_token");
  });

  it("returns Better Auth sign-out Set-Cookie headers from logout", async () => {
    const signOut = vi.fn(async () => ({
      response: { success: true },
      headers: createSetCookieHeaders(
        "better-auth.session_token=; Max-Age=0; HttpOnly; SameSite=Lax",
      ),
    }));
    const service = createBetterAuthServiceFromRuntime({
      db: {} as ProjectDb,
      runtime: createRuntime({ signOut }),
    });

    const result = await service.logout({
      cookieHeader: "better-auth.session_token=session_token",
    });

    expect(signOut).toHaveBeenCalledWith(
      expect.objectContaining({
        returnHeaders: true,
      }),
    );
    const signOutCalls = signOut.mock.calls as unknown as [
      { headers: Headers },
    ][];
    const signOutInput = signOutCalls[0]?.[0];
    expect(signOutInput?.headers.get("cookie")).toBe(
      "better-auth.session_token=session_token",
    );
    expect(result).toEqual({
      ok: true,
      setCookieHeaders: [
        "better-auth.session_token=; Max-Age=0; HttpOnly; SameSite=Lax",
      ],
    });
  });

  it("throws internal error when the default tenant cannot be resolved", async () => {
    const getSession = vi.fn(async () => ({
      session: { id: "session_1" },
      user: sessionPayload.user,
    }));
    const resolveSessionPayload = vi.fn(async () => ({
      ok: false as const,
      reason: "default_tenant_unavailable" as const,
    }));
    const service = createBetterAuthServiceFromRuntime({
      db: {} as ProjectDb,
      resolveSessionPayload,
      runtime: createRuntime({ getSession }),
    });

    await expect(
      service.getSession({
        cookieHeader: "better-auth.session_token=session_token",
      }),
    ).rejects.toMatchObject({
      data: {
        code: "INTERNAL_ERROR",
        domain: "auth",
        httpStatus: 500,
        reason: "default_tenant_unavailable",
      },
    });

    expect(getSession).toHaveBeenCalled();
  });

  it("clears the current cookie when an existing session no longer has default tenant access", async () => {
    const getSession = vi.fn(async () => ({
      session: { id: "session_1" },
      user: sessionPayload.user,
    }));
    const signOut = vi.fn(async () => ({
      response: { success: true },
      headers: createSetCookieHeaders(
        "better-auth.session_token=; Max-Age=0; HttpOnly; SameSite=Lax",
      ),
    }));
    const resolveSessionPayload = vi.fn(async () => ({
      ok: false as const,
      reason: "access_removed" as const,
    }));
    const service = createBetterAuthServiceFromRuntime({
      db: {} as ProjectDb,
      resolveSessionPayload,
      runtime: createRuntime({ getSession, signOut }),
    });

    let caughtError: unknown;
    try {
      await service.getSession({
        cookieHeader: "better-auth.session_token=session_token",
      });
    } catch (error) {
      caughtError = error;
    }

    expect(signOut).toHaveBeenCalledWith(
      expect.objectContaining({
        returnHeaders: true,
      }),
    );
    expect(caughtError).toMatchObject({
      data: {
        code: "FORBIDDEN",
        domain: "auth",
        httpStatus: 403,
        reason: "access_removed",
        responseHeaders: {
          setCookie: [
            "better-auth.session_token=; Max-Age=0; HttpOnly; SameSite=Lax",
          ],
        },
      },
    });
  });
});

function createRuntime(input: {
  getSession?: ReturnType<typeof vi.fn>;
  revokeSession?: ReturnType<typeof vi.fn>;
  signInEmail?: ReturnType<typeof vi.fn>;
  signOut?: ReturnType<typeof vi.fn>;
}): Pick<BetterAuthRuntime, "api" | "handler"> {
  return {
    api: {
      getSession: input.getSession ?? vi.fn(),
      revokeSession: input.revokeSession ?? vi.fn(),
      signInEmail: input.signInEmail ?? vi.fn(),
      signOut: input.signOut ?? vi.fn(),
    },
    handler: vi.fn(),
  } as unknown as Pick<BetterAuthRuntime, "api" | "handler">;
}

function createSetCookieHeaders(setCookie: string): Headers {
  const headers = new Headers();
  headers.append("Set-Cookie", setCookie);
  return headers;
}

function captureStdoutWrites(): {
  restore(): void;
  writes: string[];
} {
  const writes: string[] = [];
  const spy = vi
    .spyOn(process.stdout, "write")
    .mockImplementation(((chunk: string | Uint8Array): boolean => {
      writes.push(String(chunk));
      return true;
    }) as typeof process.stdout.write);

  return {
    restore() {
      spy.mockRestore();
    },
    writes,
  };
}

function parseLogRecords(writes: string[]): LogRecord[] {
  return writes
    .join("")
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as LogRecord);
}
