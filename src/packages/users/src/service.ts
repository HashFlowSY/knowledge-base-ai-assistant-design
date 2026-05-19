import { and, asc, count, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";

import {
  authAccounts,
  authSessions,
  authUsers,
  auditLogs,
  tenantMemberships,
  tenants,
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

export interface UserManagementServiceOptions {
  db: ProjectDb;
  getRequestContext?: () => {
    ipSummary?: string | null;
    requestId?: string | null;
    userAgentSummary?: string | null;
  };
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

export interface UserServiceError {
  ok: false;
  code: "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "VALIDATION_ERROR" | "INTERNAL_ERROR";
  httpStatus: 400 | 403 | 404 | 409 | 500;
  message: string;
}

interface ActiveUserRow {
  createdAt: Date;
  email: string;
  id: string;
  membershipUpdatedAt: Date;
  name: string;
  role: "admin" | "member";
  updatedAt: Date;
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

function createVisibleUserConditions(
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

async function findActiveUser(
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

async function findUserByEmail(
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

async function findMembership(
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

function createAuthMutationRepository(db: ProjectDb) {
  return {
    async upsertPasswordAccount(input: {
      passwordHash: string;
      providerId: "credential";
      userId: string;
    }): Promise<void> {
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
    async revokeUserSessions(input: { userId: string }): Promise<void> {
      await db.delete(authSessions).where(eq(authSessions.userId, input.userId));
    },
  };
}

async function insertAudit(
  db: ProjectDb,
  input: {
    action:
      | "user.created"
      | "user.updated"
      | "user.access_removed"
      | "user.password_reset";
    actor: SessionPayload;
    getRequestContext?: UserManagementServiceOptions["getRequestContext"];
    metadata: Record<string, unknown>;
    targetId: string;
  },
): Promise<void> {
  const context = input.getRequestContext?.();

  await db.insert(auditLogs).values({
    tenantId: input.actor.tenant.id,
    actorId: input.actor.user.id,
    actorType: "user",
    action: input.action,
    targetType: "user",
    targetId: input.targetId,
    metadata: input.metadata,
    requestId: context?.requestId ?? null,
    ipSummary: context?.ipSummary ?? null,
    userAgentSummary: context?.userAgentSummary ?? null,
  });
}

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

function getUpdatedFieldNames(input: UpdateUserInput): string[] {
  const fields: string[] = [];
  if (input.name !== undefined) {
    fields.push("name");
  }
  if (input.email !== undefined) {
    fields.push("email");
  }
  if (input.role !== undefined) {
    fields.push("role");
  }

  return fields;
}

function toUserSummary(row: ActiveUserRow): UserSummary {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    createdAt: row.createdAt.toISOString(),
    updatedAt:
      row.updatedAt.getTime() >= row.membershipUpdatedAt.getTime()
        ? row.updatedAt.toISOString()
        : row.membershipUpdatedAt.toISOString(),
  };
}

function createConflictError(message = "该邮箱已存在。"): UserServiceError {
  return {
    ok: false,
    code: "CONFLICT",
    httpStatus: 409,
    message,
  };
}

function createCreateUserPlan(input: {
  existingUser: { id: string } | null;
  membership: { isActive: boolean } | null;
}):
  | {
      ok: true;
      action: "create_user" | "create_membership" | "restore_membership";
      restoredAccess: boolean;
      revokeExistingSessions: boolean;
    }
  | UserServiceError {
  if (input.existingUser === null) {
    return {
      ok: true,
      action: "create_user",
      restoredAccess: false,
      revokeExistingSessions: false,
    };
  }

  if (input.membership?.isActive === true) {
    return createConflictError();
  }

  return {
    ok: true,
    action: input.membership === null ? "create_membership" : "restore_membership",
    restoredAccess: true,
    revokeExistingSessions: true,
  };
}

function createUpdateUserPlan(input: {
  actorId: string;
  input: UpdateUserInput;
  targetUserId: string;
}):
  | {
      ok: true;
      auditActions: ("user.updated" | "user.password_reset")[];
      revokeSessions: boolean;
    }
  | UserServiceError {
  if (
    input.actorId === input.targetUserId &&
    input.input.role !== undefined &&
    input.input.role === "member"
  ) {
    return createSelfProtectionError();
  }

  const auditActions: ("user.updated" | "user.password_reset")[] = [];
  if (
    input.input.name !== undefined ||
    input.input.email !== undefined ||
    input.input.role !== undefined
  ) {
    auditActions.push("user.updated");
  }
  if (input.input.password !== undefined && input.input.password !== null) {
    auditActions.push("user.password_reset");
  }

  return {
    ok: true,
    auditActions,
    revokeSessions: auditActions.includes("user.password_reset"),
  };
}

function createRemoveUserAccessPlan(input: {
  actorId: string;
  targetUserId: string;
}): { ok: true } | UserServiceError {
  return input.actorId === input.targetUserId
    ? createSelfProtectionError()
    : { ok: true };
}

function createSelfProtectionError(): UserServiceError {
  return {
    ok: false,
    code: "FORBIDDEN",
    httpStatus: 403,
    message: "不能对当前登录管理员执行此操作。",
  };
}

function createInternalError(): UserServiceError {
  return {
    ok: false,
    code: "INTERNAL_ERROR",
    httpStatus: 500,
    message: "操作失败，请稍后重试。",
  };
}

function createNotFoundError(): UserServiceError {
  return {
    ok: false,
    code: "NOT_FOUND",
    httpStatus: 404,
    message: "用户不存在或已被移除。",
  };
}

function toServiceError(error: {
  code: "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "VALIDATION_ERROR" | "INTERNAL_ERROR";
  message: string;
}): UserServiceError {
  const httpStatusByCode = {
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    VALIDATION_ERROR: 400,
    INTERNAL_ERROR: 500,
  } as const;

  return {
    ok: false,
    code: error.code,
    httpStatus: httpStatusByCode[error.code],
    message: error.message,
  };
}

function toServiceException(error: UserServiceError): Error {
  return Object.assign(new Error(error.message), { serviceError: error });
}

function fromServiceException(error: unknown): UserServiceError {
  if (
    typeof error === "object" &&
    error !== null &&
    "serviceError" in error &&
    typeof error.serviceError === "object" &&
    error.serviceError !== null
  ) {
    return error.serviceError as UserServiceError;
  }

  return createInternalError();
}
