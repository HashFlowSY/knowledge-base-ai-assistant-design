import { and, asc, count, desc, eq, sql } from "drizzle-orm";

import { authUsers, tenantMemberships } from "@kb/db";

import { toUserSummary } from "../service-mappers";
import { createVisibleUserConditions } from "../service-queries";
import type { UserManagementService, UserManagementServiceOptions } from "../service-types";

export async function listUsersOperation(
  options: UserManagementServiceOptions,
  input: Parameters<UserManagementService["listUsers"]>[0],
): ReturnType<UserManagementService["listUsers"]> {
  const conditions = createVisibleUserConditions(input.actor.tenant.id, input.query);
  const offset = (input.query.page - 1) * input.query.pageSize;
  const orderBy =
    input.query.sort === "name"
      ? [asc(authUsers.name), asc(authUsers.id)]
      : [
          desc(sql`greatest(${authUsers.updatedAt}, ${tenantMemberships.updatedAt})`),
          asc(authUsers.id),
        ];

  const [items, totalRows] = await Promise.all([
    options.db
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
      .where(and(...conditions))
      .orderBy(...orderBy)
      .limit(input.query.pageSize)
      .offset(offset),
    options.db
      .select({ value: count() })
      .from(authUsers)
      .innerJoin(tenantMemberships, eq(tenantMemberships.userId, authUsers.id))
      .where(and(...conditions)),
  ]);

  return {
    ok: true,
    page: {
      items: items.map(toUserSummary),
      page: input.query.page,
      pageSize: input.query.pageSize,
      total: totalRows[0]?.value ?? 0,
    },
  };
}
