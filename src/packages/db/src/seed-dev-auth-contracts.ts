import type { Role } from "@kb/auth";

export interface DevAuthSeedRepository {
  ensureDefaultTenant(input: { name: string; slug: string }): Promise<{ tenantId: string }>;
  upsertUser(input: { email: string; name: string }): Promise<{ userId: string }>;
  upsertMembership(input: {
    email: string;
    isActive: true;
    role: Role;
    tenantId: string;
    userId: string;
  }): Promise<void>;
  upsertPasswordAccount(input: {
    email: string;
    passwordHash: string;
    providerId: "credential";
    userId: string;
  }): Promise<void>;
}

export const defaultDevAuthUsers = [
  {
    email: "admin@example.com",
    name: "管理员",
    password: "password123",
    role: "admin" as const,
  },
  {
    email: "member@example.com",
    name: "成员",
    password: "password123",
    role: "member" as const,
  },
];
