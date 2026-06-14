import { describe, expect, it } from "vitest";

import {
  authActorSchema,
  getSessionCookieValue,
  isAdmin,
  normalizeEmail,
  sessionPayloadSchema,
} from "./index";
import {
  hashPasswordForAccount,
  revokeUserSessions,
  upsertPasswordAccount,
  verifyPasswordForAccount,
} from "./server";

describe("@kb/auth", () => {
  it("identifies admin actors", () => {
    const actor = authActorSchema.parse({
      actorId: "user_1",
      tenantId: "tenant_1",
      role: "admin",
    });

    expect(isAdmin(actor)).toBe(true);
  });

  it("normalizes email before auth and user management lookups", () => {
    expect(normalizeEmail(" Admin@Example.COM ")).toBe("admin@example.com");
  });

  it("validates the product session payload without exposing session tokens", () => {
    expect(
      sessionPayloadSchema.parse({
        user: {
          id: "user_1",
          name: "管理员",
          email: "admin@example.com",
        },
        tenant: {
          id: "tenant_1",
        },
        role: "admin",
      }),
    ).toEqual({
      user: {
        id: "user_1",
        name: "管理员",
        email: "admin@example.com",
      },
      tenant: {
        id: "tenant_1",
      },
      role: "admin",
    });

    expect(() =>
      sessionPayloadSchema.parse({
        user: { id: "user_1", name: "管理员", email: "admin@example.com" },
        tenant: { id: "tenant_1" },
        role: "admin",
        token: "secret",
      }),
    ).toThrow();
  });

  it("extracts the supported Better Auth session cookie value", () => {
    expect(
      getSessionCookieValue("foo=bar; better-auth.session_token=abc.def; theme=dark"),
    ).toBe("abc.def");
    expect(getSessionCookieValue("better-auth.session_token=abc%2Edef")).toBe("abc.def");
    expect(getSessionCookieValue("foo=bar")).toBeNull();
  });

  it("treats malformed session cookie encoding as missing credentials", () => {
    expect(getSessionCookieValue("better-auth.session_token=%")).toBeNull();
    expect(getSessionCookieValue("foo=%; theme=dark")).toBeNull();
    expect(getSessionCookieValue("foo=%; better-auth.session_token=abc%2Edef")).toBe(
      "abc.def",
    );
  });

  it("hashes and verifies Better Auth compatible password values", async () => {
    const hash = await hashPasswordForAccount("password123");

    expect(hash).not.toBe("password123");
    await expect(
      verifyPasswordForAccount({ hash, password: "password123" }),
    ).resolves.toBe(true);
    await expect(verifyPasswordForAccount({ hash, password: "wrong" })).resolves.toBe(
      false,
    );
  });

  it("upserts password accounts through an injected repository boundary", async () => {
    const calls: { passwordHash: string; userId: string }[] = [];

    await upsertPasswordAccount({
      password: "password123",
      repository: {
        async upsertPasswordAccount(input) {
          calls.push({
            passwordHash: input.passwordHash,
            userId: input.userId,
          });
        },
      },
      userId: "user_1",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.userId).toBe("user_1");
    expect(calls[0]?.passwordHash).not.toBe("password123");
  });

  it("revokes sessions through an injected repository boundary", async () => {
    const revoked: string[] = [];

    await revokeUserSessions({
      repository: {
        async revokeUserSessions(input) {
          revoked.push(input.userId);
        },
      },
      userId: "user_1",
    });

    expect(revoked).toEqual(["user_1"]);
  });
});
