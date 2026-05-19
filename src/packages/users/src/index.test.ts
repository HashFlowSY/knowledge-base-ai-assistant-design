import { describe, expect, it } from "vitest";

import {
  assertCanChangeRole,
  assertCanRemoveAccess,
  planCreateUser,
  planRemoveUserAccess,
  planUpdateUser,
  createUserInputSchema,
  listUsersQuerySchema,
  userDomainErrorSchema,
  updateUserInputSchema,
  userSummarySchema,
} from "./index";

describe("@kb/users", () => {
  it("uses the product UserSummary contract", () => {
    expect(
      userSummarySchema.parse({
        id: "user_1",
        email: "admin@example.com",
        name: "管理员",
        role: "admin",
        createdAt: "2026-05-18T00:00:00.000Z",
        updatedAt: "2026-05-18T01:00:00.000Z",
      }).role,
    ).toBe("admin");

    expect(() =>
      userSummarySchema.parse({
        id: "user_1",
        userId: "legacy_user_1",
        tenantId: "tenant_1",
        email: "admin@example.com",
        name: "管理员",
        role: "admin",
        status: "active",
        createdAt: "2026-05-18T00:00:00.000Z",
        updatedAt: "2026-05-18T01:00:00.000Z",
      }),
    ).toThrow();
  });

  it("normalizes list query defaults and allowed values", () => {
    expect(
      listUsersQuerySchema.parse({
        page: "0",
        pageSize: "100",
        filter: "disabled",
        sort: "status",
        search: "  Admin  ",
      }),
    ).toEqual({
      page: 1,
      pageSize: 8,
      filter: "all",
      sort: "updated",
      search: "Admin",
    });
  });

  it("validates create and update inputs without product user status", () => {
    expect(
      createUserInputSchema.parse({
        name: " 管理员 ",
        email: " Admin@Example.COM ",
        role: "admin",
        password: "password123",
      }),
    ).toEqual({
      name: "管理员",
      email: "admin@example.com",
      role: "admin",
      password: "password123",
    });

    expect(
      updateUserInputSchema.parse({
        name: " 新名字 ",
        password: "",
      }),
    ).toEqual({
      name: "新名字",
      password: null,
    });

    expect(() => updateUserInputSchema.parse({})).toThrow();
    expect(() =>
      createUserInputSchema.parse({ email: "x@example.com", status: "active" }),
    ).toThrow();
  });

  it("protects the current admin from self demotion or self access removal", () => {
    expect(
      assertCanChangeRole({
        actorId: "admin_1",
        targetUserId: "user_2",
        nextRole: "member",
      }),
    ).toEqual({
      ok: true,
    });

    expect(
      userDomainErrorSchema.parse(
        assertCanChangeRole({
          actorId: "admin_1",
          targetUserId: "admin_1",
          nextRole: "member",
        }),
      ),
    ).toMatchObject({
      code: "FORBIDDEN",
      message: "不能对当前登录管理员执行此操作。",
    });

    expect(
      userDomainErrorSchema.parse(
        assertCanRemoveAccess({ actorId: "admin_1", targetUserId: "admin_1" }),
      ),
    ).toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("plans create or restore behavior from global email and default tenant membership state", () => {
    expect(
      planCreateUser({
        existingUser: null,
        membership: null,
      }),
    ).toEqual({
      ok: true,
      action: "create_user",
      auditAction: "user.created",
      revokeExistingSessions: false,
      restoredAccess: false,
    });

    expect(
      planCreateUser({
        existingUser: { id: "user_2" },
        membership: { isActive: true },
      }),
    ).toMatchObject({
      ok: false,
      code: "CONFLICT",
    });

    expect(
      planCreateUser({
        existingUser: { id: "user_2" },
        membership: { isActive: false },
      }),
    ).toEqual({
      ok: true,
      action: "restore_membership",
      auditAction: "user.created",
      revokeExistingSessions: true,
      restoredAccess: true,
    });

    expect(
      planCreateUser({
        existingUser: { id: "user_2" },
        membership: null,
      }),
    ).toMatchObject({
      ok: true,
      action: "create_membership",
      restoredAccess: true,
    });
  });

  it("plans update side effects for role changes and password reset", () => {
    expect(
      planUpdateUser({
        actorId: "admin_1",
        input: { name: "成员", password: "new-password", role: "member" },
        targetUserId: "user_2",
      }),
    ).toEqual({
      ok: true,
      auditActions: ["user.updated", "user.password_reset"],
      revokeSessions: true,
    });

    expect(
      planUpdateUser({
        actorId: "admin_1",
        input: { password: null },
        targetUserId: "user_2",
      }),
    ).toEqual({
      ok: true,
      auditActions: [],
      revokeSessions: false,
    });

    expect(
      planUpdateUser({
        actorId: "admin_1",
        input: { role: "member" },
        targetUserId: "admin_1",
      }),
    ).toMatchObject({
      ok: false,
      code: "FORBIDDEN",
    });
  });

  it("plans access removal as a single transaction unit with audit and session revocation", () => {
    expect(
      planRemoveUserAccess({
        actorId: "admin_1",
        targetUserId: "user_2",
      }),
    ).toEqual({
      ok: true,
      auditAction: "user.access_removed",
      revokeSessions: true,
      softDeleteMembership: true,
    });

    expect(
      planRemoveUserAccess({
        actorId: "admin_1",
        targetUserId: "admin_1",
      }),
    ).toMatchObject({
      ok: false,
      code: "FORBIDDEN",
    });
  });
});
