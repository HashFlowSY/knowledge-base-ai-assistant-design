import { and, asc, count, desc, eq, sql } from "drizzle-orm";

import {
  authUsers,
  tenantMemberships,
  type ProjectDb,
} from "@kb/db";
import { type SessionPayload } from "@kb/auth";
import { upsertPasswordAccount } from "@kb/auth/server";

import type {
  CreateUserInput,
  ListUsersQuery,
  UpdateUserInput,
  UserSummary,
  UsersPage,
} from "./index";
import { createAuthMutationRepository } from "./auth-mutation-repository";
import { insertAudit, type UserRequestContextGetter } from "./service-audit";
import {
  createConflictError,
  createInternalError,
  createNotFoundError,
  fromServiceException,
  toServiceError,
  toServiceException,
  type UserServiceError,
} from "./service-errors";
import { getUpdatedFieldNames, toUserSummary } from "./service-mappers";
import {
  createCreateUserPlan,
  createRemoveUserAccessPlan,
  createUpdateUserPlan,
} from "./service-plans";
import {
  createVisibleUserConditions,
  findActiveUser,
  findMembership,
  findUserByEmail,
} from "./service-queries";

export { resolveDefaultTenant, resolveSessionPayload } from "./session-resolution";
export type { UserServiceError } from "./service-errors";

export interface UserManagementServiceOptions {
  db: ProjectDb;
  getRequestContext?: UserRequestContextGetter;
}

export interface UserManagementService {
  listUsers(input: {
    actor: SessionPayload;
    query: ListUsersQuery;
  }): Promise<{ ok: true; page: UsersPage } | UserServiceError>;
  createUser(input: {
    actor: SessionPayload;
    body: CreateUserInput;
  }): Promise<{ ok: true; user: UserSummary } | UserServiceError>;
  getUser(input: {
    actor: SessionPayload;
    userId: string;
  }): Promise<{ ok: true; user: UserSummary } | UserServiceError>;
  updateUser(input: {
    actor: SessionPayload;
    body: UpdateUserInput;
    userId: string;
  }): Promise<{ ok: true; user: UserSummary } | UserServiceError>;
  removeUserAccess(input: {
    actor: SessionPayload;
    userId: string;
  }): Promise<{ ok: true } | UserServiceError>;
}

export function createUserManagementService(
  options: UserManagementServiceOptions,
): UserManagementService {
  return {
    async listUsers(input) {
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
          .innerJoin(
            tenantMemberships,
            eq(tenantMemberships.userId, authUsers.id),
          )
          .where(and(...conditions))
          .orderBy(...orderBy)
          .limit(input.query.pageSize)
          .offset(offset),
        options.db
          .select({ value: count() })
          .from(authUsers)
          .innerJoin(
            tenantMemberships,
            eq(tenantMemberships.userId, authUsers.id),
          )
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
    },
    async getUser(input) {
      const target = await findActiveUser(options.db, {
        tenantId: input.actor.tenant.id,
        userId: input.userId,
      });

      if (target === null) {
        return createNotFoundError();
      }

      return { ok: true, user: toUserSummary(target) };
    },
    async createUser(input) {
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

          if (!plan.ok) {
            throw toServiceException(createConflictError(plan.message));
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
            throw toServiceException(createInternalError());
          }

          return created;
        });

        return { ok: true, user: toUserSummary(user) };
      } catch (error) {
        return fromServiceException(error);
      }
    },
    async updateUser(input) {
      const plan = createUpdateUserPlan({
        actorId: input.actor.user.id,
        input: input.body,
        targetUserId: input.userId,
      });
      if (!plan.ok) {
        return toServiceError(plan);
      }

      try {
        const updated = await options.db.transaction(async (tx) => {
          const txDb = tx as ProjectDb;
          const target = await findActiveUser(txDb, {
            tenantId: input.actor.tenant.id,
            userId: input.userId,
          });
          if (target === null) {
            throw toServiceException(createNotFoundError());
          }

          if (input.body.email !== undefined) {
            const conflicting = await findUserByEmail(txDb, input.body.email);
            if (conflicting !== null && conflicting.id !== input.userId) {
              throw toServiceException(createConflictError("该邮箱已存在。"));
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
            throw toServiceException(createNotFoundError());
          }

          return next;
        });

        return { ok: true, user: toUserSummary(updated) };
      } catch (error) {
        return fromServiceException(error);
      }
    },
    async removeUserAccess(input) {
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
    },
  };
}
