import { eq } from "drizzle-orm";

import { authAccounts, authSessions, type ProjectDb } from "@kb/db";

export interface UpsertPasswordAccountInput {
  passwordHash: string;
  providerId: "credential";
  userId: string;
}

export interface AuthMutationRepository {
  revokeUserSessions(input: { userId: string }): Promise<void>;
  upsertPasswordAccount(input: UpsertPasswordAccountInput): Promise<void>;
}

export function createAuthMutationRepository(
  db: ProjectDb,
): AuthMutationRepository {
  return {
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
    async revokeUserSessions(input) {
      await db.delete(authSessions).where(eq(authSessions.userId, input.userId));
    },
  };
}
