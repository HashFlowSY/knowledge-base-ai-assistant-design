import { eq, sql } from "drizzle-orm";

import {
  authAccounts,
  authUsers,
  tenantMemberships,
  tenants,
  type ProjectDb,
} from "@kb/db";
import type { DevAuthSeedRepository } from "./seed-dev-auth-contracts";

export function createPgDevAuthSeedRepository(
  db: ProjectDb,
): DevAuthSeedRepository {
  return {
    async ensureDefaultTenant(input) {
      const existing = await db
        .select({ id: tenants.id })
        .from(tenants)
        .where(eq(tenants.isDefault, true))
        .limit(1);

      if (existing[0] !== undefined) {
        await db
          .update(tenants)
          .set({
            name: input.name,
            slug: input.slug,
            updatedAt: new Date(),
          })
          .where(eq(tenants.id, existing[0].id));
        return { tenantId: existing[0].id };
      }

      const inserted = await db
        .insert(tenants)
        .values({
          name: input.name,
          slug: input.slug,
          isDefault: true,
        })
        .returning({ id: tenants.id });

      return { tenantId: inserted[0]?.id ?? "" };
    },
    async upsertUser(input) {
      const now = new Date();
      const existing = await db
        .select({ id: authUsers.id })
        .from(authUsers)
        .where(sql`lower(${authUsers.email}) = ${input.email}`)
        .limit(1);

      if (existing[0] !== undefined) {
        await db
          .update(authUsers)
          .set({
            email: input.email,
            name: input.name,
            updatedAt: now,
          })
          .where(eq(authUsers.id, existing[0].id));
        return { userId: existing[0].id };
      }

      const userId = crypto.randomUUID();
      await db.insert(authUsers).values({
        id: userId,
        email: input.email,
        name: input.name,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      });

      return { userId };
    },
    async upsertPasswordAccount(input) {
      const now = new Date();
      await db
        .insert(authAccounts)
        .values({
          id: `credential:${input.userId}`,
          accountId: input.userId,
          providerId: input.providerId,
          userId: input.userId,
          passwordHash: input.passwordHash,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [authAccounts.providerId, authAccounts.accountId],
          set: {
            passwordHash: input.passwordHash,
            updatedAt: now,
          },
        });
    },
    async upsertMembership(input) {
      const now = new Date();
      await db
        .insert(tenantMemberships)
        .values({
          tenantId: input.tenantId,
          userId: input.userId,
          role: input.role,
          isActive: input.isActive,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [tenantMemberships.tenantId, tenantMemberships.userId],
          set: {
            role: input.role,
            isActive: input.isActive,
            updatedAt: now,
          },
        });
    },
  };
}
