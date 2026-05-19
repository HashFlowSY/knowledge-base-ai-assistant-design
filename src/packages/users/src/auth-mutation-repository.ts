import { eq } from "drizzle-orm";

import { authAccounts, authSessions, type ProjectDb } from "@kb/db";

export function createAuthMutationRepository(db: ProjectDb) {
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
