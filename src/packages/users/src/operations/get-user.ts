import { createNotFoundError } from "../service-errors";
import { toUserSummary } from "../service-mappers";
import { findActiveUser } from "../service-queries";
import type { UserManagementService, UserManagementServiceOptions } from "../service-types";

export async function getUserOperation(
  options: UserManagementServiceOptions,
  input: Parameters<UserManagementService["getUser"]>[0],
): ReturnType<UserManagementService["getUser"]> {
  const target = await findActiveUser(options.db, {
    tenantId: input.actor.tenant.id,
    userId: input.userId,
  });

  if (target === null) {
    throw createNotFoundError();
  }

  return { ok: true, user: toUserSummary(target) };
}
