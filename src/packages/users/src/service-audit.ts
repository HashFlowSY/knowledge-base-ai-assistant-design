import { auditLogs, type ProjectDb } from "@kb/db";
import type { SessionPayload } from "@kb/auth";

export type UserRequestContextGetter = () => {
  ipSummary?: string | null;
  requestId?: string | null;
  userAgentSummary?: string | null;
};

export async function insertAudit(
  db: ProjectDb,
  input: {
    action:
      | "user.created"
      | "user.updated"
      | "user.access_removed"
      | "user.password_reset";
    actor: SessionPayload;
    getRequestContext?: UserRequestContextGetter | undefined;
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
