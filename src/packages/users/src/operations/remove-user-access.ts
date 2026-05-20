import { and, eq } from "drizzle-orm";

import { tenantMemberships, type ProjectDb } from "@kb/db";

import { createAuthMutationRepository } from "../auth-mutation-repository";
import { insertAudit } from "../service-audit";
import {
  createNotFoundError,
  fromServiceException,
  toServiceError,
  toServiceException,
} from "../service-errors";
import { createRemoveUserAccessPlan } from "../service-plans";
import { findActiveUser } from "../service-queries";
import type { UserManagementService, UserManagementServiceOptions } from "../service-types";

export async function removeUserAccessOperation(
  options: UserManagementServiceOptions,
  input: Parameters<UserManagementService["removeUserAccess"]>[0],
): ReturnType<UserManagementService["removeUserAccess"]> {
  const plan = createRemoveUserAccessPlan({
    actorId: input.actor.user.id,
    targetUserId: input.userId,
  });
  if (!plan.ok) {
    return toServiceError(plan);
  }

  try {
    await options.db.transaction(async (tx) => {
      const txDb = tx as ProjectDb;
      const target = await findActiveUser(txDb, {
        tenantId: input.actor.tenant.id,
        userId: input.userId,
      });
      if (target === null) {
        throw toServiceException(createNotFoundError());
      }

      await txDb
        .update(tenantMemberships)
        .set({ isActive: false, updatedAt: new Date() })
        .where(
          and(
            eq(tenantMemberships.tenantId, input.actor.tenant.id),
            eq(tenantMemberships.userId, input.userId),
            eq(tenantMemberships.isActive, true),
          ),
        );
      await createAuthMutationRepository(txDb).revokeUserSessions({
        userId: input.userId,
      });
      await insertAudit(txDb, {
        actor: input.actor,
        action: "user.access_removed",
        targetId: input.userId,
        metadata: { sessionsRevoked: true },
        getRequestContext: options.getRequestContext,
      });
    });

    return { ok: true };
  } catch (error) {
    return fromServiceException(error);
  }
}
