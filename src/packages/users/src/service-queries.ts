import { and, eq, ilike, or, sql, type SQL } from "drizzle-orm";

import { authUsers, tenantMemberships, type ProjectDb } from "@kb/db";

import type { ListUsersQuery } from "./schemas";
import type { ActiveUserRow } from "./service-mappers";

export function createVisibleUserConditions(
  tenantId: string,
  query: ListUsersQuery,
): SQL<unknown>[] {
  const conditions: SQL<unknown>[] = [
    eq(tenantMemberships.tenantId, tenantId),
    eq(tenantMemberships.isActive, true),
  ];

  if (query.filter === "admin" || query.filter === "member") {
    conditions.push(eq(tenantMemberships.role, query.filter));
  }

  if (query.search !== undefined) {
    const pattern = `%${query.search}%`;
    const searchCondition = or(
      ilike(authUsers.name, pattern),
      ilike(authUsers.email, pattern),
    );
    if (searchCondition !== undefined) {
      conditions.push(searchCondition);
    }
  }

  return conditions;
}

export async function findActiveUser(
  db: ProjectDb,
  input: { tenantId: string; userId: string },
): Promise<ActiveUserRow | null> {
  const rows = await db
    .select({
      id: authUsers.id,
      name: authUsers.name,
      email: authUsers.email,
      role: tenantMemberships.role,
      createdAt: authUsers.createdAt,
      updatedAt: authUsers.updatedAt,
      membershipUpdatedAt: tenantMemberships.updatedAt,
    })
    .from(authUsers)
    .innerJoin(tenantMemberships, eq(tenantMemberships.userId, authUsers.id))
    .where(
      and(
        eq(authUsers.id, input.userId),
        eq(tenantMemberships.tenantId, input.tenantId),
        eq(tenantMemberships.isActive, true),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

export async function findUserByEmail(
  db: ProjectDb,
  email: string,
): Promise<{ id: string } | null> {
  const rows = await db
    .select({ id: authUsers.id })
    .from(authUsers)
    .where(sql`lower(${authUsers.email}) = ${email}`)
    .limit(1);

  return rows[0] ?? null;
}

export async function findMembership(
  db: ProjectDb,
  input: { tenantId: string; userId: string },
): Promise<{ isActive: boolean } | null> {
  const rows = await db
    .select({ isActive: tenantMemberships.isActive })
    .from(tenantMemberships)
    .where(
      and(
        eq(tenantMemberships.tenantId, input.tenantId),
        eq(tenantMemberships.userId, input.userId),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}
