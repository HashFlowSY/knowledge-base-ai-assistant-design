import { describe, expect, it, vi } from "vitest";

import type { SessionPayload } from "@kb/auth";
import type { BetterAuthRuntime } from "@kb/auth/server";
import type { ProjectDb } from "@kb/db";

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
  it("returns forbidden with Set-Cookie cleanup when signed-in user lacks default tenant access", async () => {
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

    const result = await service.login({
      email: "admin@example.com",
      password: "password123",
    });

    expect(resolveSessionPayload).toHaveBeenCalledWith(
      expect.anything(),
      { user: sessionPayload.user },
    );
    expect(result).toMatchObject({
      ok: false,
      code: "FORBIDDEN",
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
    expect(result).toEqual({
      ok: false,
      code: "FORBIDDEN",
      httpStatus: 403,
      message: "当前账号无权访问默认租户，请联系管理员。",
      setCookieHeaders: [
        "better-auth.session_token=; Max-Age=0; HttpOnly; SameSite=Lax",
      ],
    });
  });

  it("returns internal error after login when the default tenant cannot be resolved", async () => {
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

    const result = await service.login({
      email: "admin@example.com",
      password: "password123",
    });

    expect(result).toEqual({
      ok: false,
      code: "INTERNAL_ERROR",
      httpStatus: 500,
      message: "操作失败，请稍后重试。",
    });
    expect(signOut).not.toHaveBeenCalled();
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

  it("returns internal error when the default tenant cannot be resolved", async () => {
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

    const result = await service.getSession({
      cookieHeader: "better-auth.session_token=session_token",
    });

    expect(getSession).toHaveBeenCalled();
    expect(result).toEqual({
      ok: false,
      code: "INTERNAL_ERROR",
      httpStatus: 500,
      message: "操作失败，请稍后重试。",
    });
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

    const result = await service.getSession({
      cookieHeader: "better-auth.session_token=session_token",
    });

    expect(signOut).toHaveBeenCalledWith(
      expect.objectContaining({
        returnHeaders: true,
      }),
    );
    expect(result).toEqual({
      ok: false,
      code: "FORBIDDEN",
      httpStatus: 403,
      message: "当前账号无权访问默认租户，请联系管理员。",
      setCookieHeaders: [
        "better-auth.session_token=; Max-Age=0; HttpOnly; SameSite=Lax",
      ],
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
