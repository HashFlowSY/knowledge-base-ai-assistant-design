import { and, eq } from "drizzle-orm";

import { tenantMemberships, tenants, type ProjectDb } from "@kb/db";
import type { SessionPayload } from "@kb/auth";

export async function resolveDefaultTenant(db: ProjectDb): Promise<string | null> {
  const rows = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.isDefault, true))
    .limit(2);

  return rows.length === 1 ? rows[0]?.id ?? null : null;
}

export async function resolveSessionPayload(
  db: ProjectDb,
  input: { user: { email: string; id: string; name: string } },
): Promise<
  | SessionPayload
  | {
      ok: false;
      reason: "access_removed" | "default_tenant_unavailable";
    }
> {
  const defaultTenantId = await resolveDefaultTenant(db);
  if (defaultTenantId === null) {
    return { ok: false, reason: "default_tenant_unavailable" };
  }

  const rows = await db
    .select({
      role: tenantMemberships.role,
    })
    .from(tenantMemberships)
    .where(
      and(
        eq(tenantMemberships.tenantId, defaultTenantId),
        eq(tenantMemberships.userId, input.user.id),
        eq(tenantMemberships.isActive, true),
      ),
    )
    .limit(1);

  const membership = rows[0];
  if (membership === undefined) {
    return { ok: false, reason: "access_removed" };
  }

  return {
    user: {
      id: input.user.id,
      name: input.user.name,
      email: input.user.email,
    },
    tenant: { id: defaultTenantId },
    role: membership.role,
  };
}
