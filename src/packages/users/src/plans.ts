import type { z } from "zod";

import type { roleSchema } from "@kb/auth";

import type { UpdateUserInput } from "./schemas";
import {
  createSelfProtectionError,
  type UserDomainError,
  type UserDomainResult,
} from "./domain-errors";

export type CreateUserPlan =
  | {
      ok: true;
      action: "create_user" | "create_membership" | "restore_membership";
      auditAction: "user.created";
      restoredAccess: boolean;
      revokeExistingSessions: boolean;
    }
  | UserDomainError;

export type UpdateUserPlan =
  | {
      ok: true;
      auditActions: ("user.updated" | "user.password_reset")[];
      revokeSessions: boolean;
    }
  | UserDomainError;

export type RemoveUserAccessPlan =
  | {
      ok: true;
      auditAction: "user.access_removed";
      revokeSessions: true;
      softDeleteMembership: true;
    }
  | UserDomainError;

export function assertCanChangeRole(input: {
  actorId: string;
  targetUserId: string;
  nextRole: z.infer<typeof roleSchema>;
}): UserDomainResult {
  if (input.actorId === input.targetUserId && input.nextRole === "member") {
    return createSelfProtectionError();
  }

  return { ok: true };
}

export function assertCanRemoveAccess(input: {
  actorId: string;
  targetUserId: string;
}): UserDomainResult {
  if (input.actorId === input.targetUserId) {
    return createSelfProtectionError();
  }

  return { ok: true };
}

export function planCreateUser(input: {
  existingUser: { id: string } | null;
  membership: { isActive: boolean } | null;
}): CreateUserPlan {
  if (input.existingUser === null) {
    return {
      ok: true,
      action: "create_user",
      auditAction: "user.created",
      restoredAccess: false,
      revokeExistingSessions: false,
    };
  }

  if (input.membership?.isActive === true) {
    return {
      ok: false,
      code: "CONFLICT",
      message: "该邮箱已存在。",
    };
  }

  return {
    ok: true,
    action: input.membership === null ? "create_membership" : "restore_membership",
    auditAction: "user.created",
    restoredAccess: true,
    revokeExistingSessions: true,
  };
}

export function planUpdateUser(input: {
  actorId: string;
  input: UpdateUserInput;
  targetUserId: string;
}): UpdateUserPlan {
  if (input.input.role !== undefined) {
    const roleCheck = assertCanChangeRole({
      actorId: input.actorId,
      nextRole: input.input.role,
      targetUserId: input.targetUserId,
    });
    if (!roleCheck.ok) {
      return roleCheck;
    }
  }

  const changesProfile =
    input.input.name !== undefined ||
    input.input.email !== undefined ||
    input.input.role !== undefined;
  const resetsPassword =
    input.input.password !== undefined &&
    input.input.password !== null &&
    input.input.password.trim().length > 0;
  const auditActions: ("user.updated" | "user.password_reset")[] = [];

  if (changesProfile) {
    auditActions.push("user.updated");
  }
  if (resetsPassword) {
    auditActions.push("user.password_reset");
  }

  return {
    ok: true,
    auditActions,
    revokeSessions: resetsPassword,
  };
}

export function planRemoveUserAccess(input: {
  actorId: string;
  targetUserId: string;
}): RemoveUserAccessPlan {
  const accessCheck = assertCanRemoveAccess(input);
  if (!accessCheck.ok) {
    return accessCheck;
  }

  return {
    ok: true,
    auditAction: "user.access_removed",
    revokeSessions: true,
    softDeleteMembership: true,
  };
}
