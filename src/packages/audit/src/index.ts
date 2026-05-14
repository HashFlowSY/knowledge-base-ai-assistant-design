import { z } from "zod";

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
