import { z } from "zod";

import { auditLogs, type ProjectDb } from "@kb/db";
import { isoTimestampSchema } from "@kb/shared";

export const auditActorSchema = z.discriminatedUnion("actorType", [
  z.object({
    actorType: z.literal("user"),
    actorId: z.string().min(1),
  }),
  z.object({
    actorType: z.literal("system"),
    actorId: z.null().optional(),
  }),
]);

export type AuditActor = z.infer<typeof auditActorSchema>;

export const auditEventSchema = z.object({
  tenantId: z.string().min(1),
  action: z.string().min(1),
  targetType: z.string().min(1),
  targetId: z.string().min(1),
  requestId: z.string().min(1).optional(),
  actor: auditActorSchema,
  metadata: z.record(z.unknown()).default({}),
  timestamp: isoTimestampSchema,
});

export type AuditEvent = z.infer<typeof auditEventSchema>;

export type AuditActorType = "system" | "user";

export interface AuditLogInput {
  tenantId: string;
  actorId: string | null;
  actorType: AuditActorType;
  action: string;
  targetType: string;
  targetId: string;
  metadata?: Record<string, unknown>;
  requestId?: string | null;
  ipSummary?: string | null;
  userAgentSummary?: string | null;
}

export interface AuditLogRecorder {
  record(input: AuditLogInput): Promise<void>;
}

export type AuditLogDb = Pick<ProjectDb, "insert">;

export async function recordAuditLog(
  db: AuditLogDb,
  input: AuditLogInput,
): Promise<void> {
  await db.insert(auditLogs).values({
    tenantId: input.tenantId,
    actorId: input.actorId,
    actorType: input.actorType,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    metadata: input.metadata ?? {},
    requestId: input.requestId ?? null,
    ipSummary: input.ipSummary ?? null,
    userAgentSummary: input.userAgentSummary ?? null,
  });
}

export function createAuditLogRecorder(db: AuditLogDb): AuditLogRecorder {
  return {
    async record(input) {
      await recordAuditLog(db, input);
    },
  };
}
