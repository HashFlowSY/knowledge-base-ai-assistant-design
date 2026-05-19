import type { UpdateUserInput } from "./index";
import {
  createConflictError,
  createSelfProtectionError,
  type UserServiceError,
} from "./service-errors";

export function createCreateUserPlan(input: {
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

export function createUpdateUserPlan(input: {
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

export function createRemoveUserAccessPlan(input: {
  actorId: string;
  targetUserId: string;
}): { ok: true } | UserServiceError {
  return input.actorId === input.targetUserId
    ? createSelfProtectionError()
    : { ok: true };
}
