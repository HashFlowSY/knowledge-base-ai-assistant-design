import { describe, expect, it } from "vitest";

import { createDefaultApiApp } from "../app";
import { adminSession } from "../testing/fakes";
import {
  createEmptyUserService,
  createUnauthenticatedAuthService,
} from "./defaults";

describe("api runtime defaults", () => {
  it("keeps default service stubs available through an internal module boundary", async () => {
    const authService = createUnauthenticatedAuthService();
    const userService = createEmptyUserService();

    await expect(
      authService.getSession({ cookieHeader: null }),
    ).resolves.toMatchObject({
      ok: false,
      code: "UNAUTHORIZED",
      httpStatus: 401,
      message: "请先登录。",
    });
    await expect(
      userService.createUser({
        actor: adminSession,
        body: {
          name: "成员",
          email: "member@example.com",
          role: "member",
          password: "password123",
        },
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: "INTERNAL_ERROR",
      httpStatus: 500,
      message: "操作失败，请稍后重试。",
    });
  });

  it("fails fast when default runtime configuration is invalid", () => {
    expect(() => createDefaultApiApp({ NODE_ENV: "production" })).toThrow();
  });
});
