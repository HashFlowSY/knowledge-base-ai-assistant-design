import { describe, expect, it } from "vitest";

import { ApiClientError } from "../api/client";
import { getAppShellSessionGateDecision } from "./session-gate";

const adminSession = {
  user: { id: "admin_1", name: "管理员", email: "admin@example.com" },
  tenant: { id: "tenant_1" },
  role: "admin" as const,
};

describe("app shell session gate", () => {
  it("redirects only unauthorized session errors to login with redirectTo", () => {
    expect(
      getAppShellSessionGateDecision({
        error: createApiError("UNAUTHORIZED", 401),
        isLoading: false,
        pathname: "/workspace",
        session: null,
      }),
    ).toEqual({
      kind: "redirect",
      href: "/login?redirectTo=%2Fworkspace",
    });
  });

  it("redirects forbidden default-tenant access to login without redirectTo", () => {
    expect(
      getAppShellSessionGateDecision({
        error: createApiError("FORBIDDEN", 403),
        isLoading: false,
        pathname: "/workspace",
        session: null,
      }),
    ).toEqual({
      kind: "clear-session-and-redirect",
      href: "/login",
    });
  });

  it("renders a safe error state for internal and rate-limited session errors", () => {
    expect(
      getAppShellSessionGateDecision({
        error: createApiError("INTERNAL_ERROR", 500),
        isLoading: false,
        pathname: "/workspace",
        session: null,
      }),
    ).toEqual({
      kind: "error",
      message: "操作失败，请稍后重试。",
    });

    expect(
      getAppShellSessionGateDecision({
        error: createApiError("RATE_LIMITED", 429),
        isLoading: false,
        pathname: "/workspace",
        session: null,
      }),
    ).toEqual({
      kind: "error",
      message: "请求过于频繁，请稍后重试。",
    });
  });

  it("keeps admin route authorization separate from session query errors", () => {
    expect(
      getAppShellSessionGateDecision({
        error: null,
        isLoading: false,
        pathname: "/users",
        session: { ...adminSession, role: "member" },
      }),
    ).toEqual({
      kind: "redirect",
      href: "/unauthorized",
    });

    expect(
      getAppShellSessionGateDecision({
        error: null,
        isLoading: false,
        pathname: "/users",
        session: adminSession,
      }),
    ).toEqual({ kind: "render" });
  });
});

function createApiError(code: string, httpStatus: number): ApiClientError {
  return new ApiClientError({
    success: false,
    code,
    httpStatus,
    message:
      code === "RATE_LIMITED"
        ? "请求过于频繁，请稍后重试。"
        : "操作失败，请稍后重试。",
    requestId: "req_test",
  });
}
