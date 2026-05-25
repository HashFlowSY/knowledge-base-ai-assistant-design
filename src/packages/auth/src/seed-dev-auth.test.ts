import { describe, expect, it } from "vitest";

import {
  seedDevAuth,
  seedDevAuthFromEnvironment,
  shouldRunDevAuthSeed,
} from "./seed-dev-auth";

describe("dev auth seed", () => {
  it("refuses to seed default accounts in production", () => {
    expect(shouldRunDevAuthSeed("production")).toBe(false);
  });

  it("allows local and test seeding", () => {
    expect(shouldRunDevAuthSeed("development")).toBe(true);
    expect(shouldRunDevAuthSeed("test")).toBe(true);
    expect(shouldRunDevAuthSeed(undefined)).toBe(true);
  });

  it("upserts the default tenant and default auth users idempotently", async () => {
    const tenants: string[] = [];
    const users: { email: string; name: string }[] = [];
    const memberships: { email: string; role: "admin" | "member" }[] = [];
    const passwords: { email: string; passwordHash: string }[] = [];

    const result = await seedDevAuth({
      nodeEnv: "development",
      repository: {
        async ensureDefaultTenant(input) {
          tenants.push(input.slug);
          return { tenantId: "tenant_default" };
        },
        async upsertUser(input) {
          users.push({ email: input.email, name: input.name });
          return { userId: `user_${input.email.split("@")[0]}` };
        },
        async upsertMembership(input) {
          memberships.push({ email: input.email, role: input.role });
        },
        async upsertPasswordAccount(input) {
          passwords.push({ email: input.email, passwordHash: input.passwordHash });
        },
      },
    });

    expect(result).toEqual({
      seeded: true,
      message: "Dev auth seed created or repaired default tenant and users.",
    });
    expect(tenants).toEqual(["default"]);
    expect(users).toEqual([
      { email: "admin@example.com", name: "管理员" },
      { email: "member@example.com", name: "成员" },
    ]);
    expect(memberships).toEqual([
      { email: "admin@example.com", role: "admin" },
      { email: "member@example.com", role: "member" },
    ]);
    expect(passwords).toHaveLength(2);
    expect(passwords[0]?.passwordHash).not.toBe("password123");
  });

  it("requires DATABASE_URL when seeding from the process environment", async () => {
    await expect(
      seedDevAuthFromEnvironment({ NODE_ENV: "development" }),
    ).rejects.toThrow();
  });
});
