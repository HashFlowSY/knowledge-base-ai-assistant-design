import { and, eq } from "drizzle-orm";

import { upsertPasswordAccount } from "@kb/auth/server";
import { authUsers, tenantMemberships, type ProjectDb } from "@kb/db";
import { isAppError } from "@kb/errors";

import { createAuthMutationRepository } from "../auth-mutation-repository";
import { insertAudit } from "../service-audit";
import { createInternalError } from "../service-errors";
import { toUserSummary } from "../service-mappers";
import { createCreateUserPlan } from "../service-plans";
import {
  findActiveUser,
  findMembership,
  findUserByEmail,
} from "../service-queries";
import type { UserManagementService, UserManagementServiceOptions } from "../service-types";

export async function createUserOperation(
  options: UserManagementServiceOptions,
  input: Parameters<UserManagementService["createUser"]>[0],
): ReturnType<UserManagementService["createUser"]> {
  try {
    const user = await options.db.transaction(async (tx) => {
      const txDb = tx as ProjectDb;
      const existingUser = await findUserByEmail(txDb, input.body.email);
      const membership =
        existingUser === null
          ? null
          : await findMembership(txDb, {
              tenantId: input.actor.tenant.id,
              userId: existingUser.id,
            });
      const plan = createCreateUserPlan({ existingUser, membership });

      if (isAppError(plan)) {
        throw plan;
      }

      const now = new Date();
      const userId = existingUser?.id ?? crypto.randomUUID();

      if (plan.action === "create_user") {
        await txDb.insert(authUsers).values({
          id: userId,
          name: input.body.name,
          email: input.body.email,
          emailVerified: false,
          createdAt: now,
          updatedAt: now,
        });
        await txDb.insert(tenantMemberships).values({
          tenantId: input.actor.tenant.id,
          userId,
          role: input.body.role,
          isActive: true,
          invitedByUserId: input.actor.user.id,
          createdAt: now,
          updatedAt: now,
        });
      } else {
        await txDb
          .update(authUsers)
          .set({
            name: input.body.name,
            email: input.body.email,
            updatedAt: now,
          })
          .where(eq(authUsers.id, userId));

        if (plan.action === "create_membership") {
          await txDb.insert(tenantMemberships).values({
            tenantId: input.actor.tenant.id,
            userId,
            role: input.body.role,
            isActive: true,
            invitedByUserId: input.actor.user.id,
            createdAt: now,
            updatedAt: now,
          });
        } else {
          await txDb
            .update(tenantMemberships)
            .set({
              role: input.body.role,
              isActive: true,
              invitedByUserId: input.actor.user.id,
              updatedAt: now,
            })
            .where(
              and(
                eq(tenantMemberships.tenantId, input.actor.tenant.id),
                eq(tenantMemberships.userId, userId),
              ),
            );
        }
      }

      await upsertPasswordAccount({
        password: input.body.password,
        repository: createAuthMutationRepository(txDb),
        userId,
      });

      if (plan.revokeExistingSessions) {
        await createAuthMutationRepository(txDb).revokeUserSessions({ userId });
      }

      await insertAudit(txDb, {
        actor: input.actor,
        action: "user.created",
        targetId: userId,
        metadata: {
          email: input.body.email,
          role: input.body.role,
          restoredAccess: plan.restoredAccess,
          sessionsRevoked: plan.revokeExistingSessions,
        },
        getRequestContext: options.getRequestContext,
      });

      const created = await findActiveUser(txDb, {
        tenantId: input.actor.tenant.id,
        userId,
      });
      if (created === null) {
        throw createInternalError();
      }

      return created;
    });

    return { ok: true, user: toUserSummary(user) };
  } catch (error) {
    if (isAppError(error)) {
      throw error;
    }

    throw createInternalError(error);
  }
}
