import { and, eq } from "drizzle-orm";

import { upsertPasswordAccount } from "@kb/auth/server";
import { authUsers, tenantMemberships, type ProjectDb } from "@kb/db";
import { isAppError } from "@kb/errors";

import { createAuthMutationRepository } from "../auth-mutation-repository";
import { insertAudit } from "../service-audit";
import {
  createConflictError,
  createInternalError,
  createNotFoundError,
} from "../service-errors";
import { getUpdatedFieldNames, toUserSummary } from "../service-mappers";
import { createUpdateUserPlan } from "../service-plans";
import {
  findActiveUser,
  findUserByEmail,
} from "../service-queries";
import type { UserManagementService, UserManagementServiceOptions } from "../service-types";

export async function updateUserOperation(
  options: UserManagementServiceOptions,
  input: Parameters<UserManagementService["updateUser"]>[0],
): ReturnType<UserManagementService["updateUser"]> {
  const plan = createUpdateUserPlan({
    actorId: input.actor.user.id,
    input: input.body,
    targetUserId: input.userId,
  });
  if (isAppError(plan)) {
    throw plan;
  }

  try {
    const updated = await options.db.transaction(async (tx) => {
      const txDb = tx as ProjectDb;
      const target = await findActiveUser(txDb, {
        tenantId: input.actor.tenant.id,
        userId: input.userId,
      });
      if (target === null) {
        throw createNotFoundError();
      }

      if (input.body.email !== undefined) {
        const conflicting = await findUserByEmail(txDb, input.body.email);
        if (conflicting !== null && conflicting.id !== input.userId) {
          throw createConflictError("该邮箱已存在。");
        }
      }

      const now = new Date();
      const userUpdates = {
        ...(input.body.name === undefined ? {} : { name: input.body.name }),
        ...(input.body.email === undefined ? {} : { email: input.body.email }),
      };
      if (Object.keys(userUpdates).length > 0) {
        await txDb
          .update(authUsers)
          .set({ ...userUpdates, updatedAt: now })
          .where(eq(authUsers.id, input.userId));
      }

      if (input.body.role !== undefined) {
        await txDb
          .update(tenantMemberships)
          .set({ role: input.body.role, updatedAt: now })
          .where(
            and(
              eq(tenantMemberships.tenantId, input.actor.tenant.id),
              eq(tenantMemberships.userId, input.userId),
              eq(tenantMemberships.isActive, true),
            ),
          );
      }

      if (input.body.password !== undefined && input.body.password !== null) {
        await upsertPasswordAccount({
          password: input.body.password,
          repository: createAuthMutationRepository(txDb),
          userId: input.userId,
        });
      }

      if (plan.revokeSessions) {
        await createAuthMutationRepository(txDb).revokeUserSessions({
          userId: input.userId,
        });
      }

      if (plan.auditActions.includes("user.updated")) {
        await insertAudit(txDb, {
          actor: input.actor,
          action: "user.updated",
          targetId: input.userId,
          metadata: {
            changedFields: getUpdatedFieldNames(input.body),
            email: input.body.email,
            role: input.body.role,
          },
          getRequestContext: options.getRequestContext,
        });
      }
      if (plan.auditActions.includes("user.password_reset")) {
        await insertAudit(txDb, {
          actor: input.actor,
          action: "user.password_reset",
          targetId: input.userId,
          metadata: { sessionsRevoked: true },
          getRequestContext: options.getRequestContext,
        });
      }

      const next = await findActiveUser(txDb, {
        tenantId: input.actor.tenant.id,
        userId: input.userId,
      });
      if (next === null) {
        throw createNotFoundError();
      }

      return next;
    });

    return { ok: true, user: toUserSummary(updated) };
  } catch (error) {
    if (isAppError(error)) {
      throw error;
    }

    throw createInternalError(error);
  }
}
