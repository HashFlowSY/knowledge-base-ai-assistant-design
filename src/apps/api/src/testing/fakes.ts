import type { SessionPayload } from "@kb/auth";

import type { AuthService } from "../app";

export const adminSession = {
  user: { id: "admin_1", name: "管理员", email: "admin@example.com" },
  tenant: { id: "tenant_1" },
  role: "admin" as const,
} satisfies SessionPayload;

export const memberSession = {
  user: { id: "member_1", name: "成员", email: "member@example.com" },
  tenant: { id: "tenant_1" },
  role: "member" as const,
} satisfies SessionPayload;

export const userSummary = {
  id: "user_2",
  name: "成员",
  email: "member@example.com",
  role: "member" as const,
  createdAt: "2026-05-18T00:00:00.000Z",
  updatedAt: "2026-05-18T00:00:00.000Z",
};

export function createStaticAuthService(payload: SessionPayload): AuthService {
  return {
    async login() {
      return {
        ok: false as const,
        code: "UNAUTHORIZED",
        message: "邮箱或密码不正确。",
        httpStatus: 401 as const,
      };
    },
    async logout() {
      return { ok: true as const };
    },
    async getSession() {
      return {
        ok: true as const,
        payload,
      };
    },
  };
}
