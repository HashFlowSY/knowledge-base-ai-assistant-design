import { describe, expect, it, vi } from "vitest";

import type { ProjectDb } from "@kb/db";
import { isAppError } from "@kb/errors";

import { createNotFoundError } from "./service-errors";
import { getUserOperation } from "./operations/get-user";
import { resolveSessionPayload } from "./service";

describe("user service error helpers", () => {
  it("maps missing active users to the shared AppError contract", () => {
    const error = createNotFoundError();

    expect(isAppError(error)).toBe(true);
    expect(error.data).toMatchObject({
      code: "NOT_FOUND",
      httpStatus: 404,
      domain: "users",
      reason: "user_not_found",
      message: "用户不存在或已被移除。",
    });
  });
});

describe("resolveSessionPayload", () => {
  it("reports default tenant unavailable when no default tenant exists", async () => {
    const db = createSelectMock([[]]);

    await expect(
      resolveSessionPayload(db, {
        user: { id: "user_1", name: "管理员", email: "admin@example.com" },
      }),
    ).resolves.toEqual({
      ok: false,
      reason: "default_tenant_unavailable",
    });
  });

  it("reports default tenant unavailable when multiple defaults exist", async () => {
    const db = createSelectMock([[{ id: "tenant_1" }, { id: "tenant_2" }]]);

    await expect(
      resolveSessionPayload(db, {
        user: { id: "user_1", name: "管理员", email: "admin@example.com" },
      }),
    ).resolves.toEqual({
      ok: false,
      reason: "default_tenant_unavailable",
    });
  });

  it("reports access removed when the default tenant exists but membership is unavailable", async () => {
    const db = createSelectMock([[{ id: "tenant_1" }], []]);

    await expect(
      resolveSessionPayload(db, {
        user: { id: "user_1", name: "成员", email: "member@example.com" },
      }),
    ).resolves.toEqual({
      ok: false,
      reason: "access_removed",
    });
  });

  it("returns the session payload when default tenant and active membership exist", async () => {
    const db = createSelectMock([[{ id: "tenant_1" }], [{ role: "admin" }]]);

    await expect(
      resolveSessionPayload(db, {
        user: { id: "user_1", name: "管理员", email: "admin@example.com" },
      }),
    ).resolves.toEqual({
      user: { id: "user_1", name: "管理员", email: "admin@example.com" },
      tenant: { id: "tenant_1" },
      role: "admin",
    });
  });
});

describe("user service operations", () => {
  it("throws AppError when a requested active user is missing", async () => {
    await expect(
      getUserOperation(
        { db: createActiveUserSelectMock([]) },
        {
          actor: {
            user: { id: "admin_1", name: "管理员", email: "admin@example.com" },
            tenant: { id: "tenant_1" },
            role: "admin",
          },
          userId: "user_2",
        },
      ),
    ).rejects.toMatchObject({
      data: {
        code: "NOT_FOUND",
        httpStatus: 404,
        domain: "users",
        reason: "user_not_found",
      },
    });
  });
});

function createSelectMock(results: unknown[][]): ProjectDb {
  const queuedResults = [...results];
  const select = vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(async () => queuedResults.shift() ?? []),
      })),
    })),
  }));

  return { select } as unknown as ProjectDb;
}

function createActiveUserSelectMock(rows: unknown[]): ProjectDb {
  const select = vi.fn(() => ({
    from: vi.fn(() => ({
      innerJoin: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => rows),
        })),
      })),
    })),
  }));

  return { select } as unknown as ProjectDb;
}
