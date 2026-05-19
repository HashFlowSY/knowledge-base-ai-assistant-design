import { describe, expect, it, vi } from "vitest";

import type { ProjectDb } from "@kb/db";

import { createNotFoundError } from "./service-errors";
import { resolveSessionPayload } from "./service";

describe("user service error helpers", () => {
  it("maps missing active users to the service HTTP error contract", () => {
    expect(createNotFoundError()).toEqual({
      ok: false,
      code: "NOT_FOUND",
      httpStatus: 404,
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
