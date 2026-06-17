import { recordAuditLog } from "@kb/audit";
import { createSafeErrorLogFields } from "@kb/observability";

import type { KnowledgeDb } from "../../../service/queries";
import type { KnowledgeBaseServiceOptions } from "../../../service/types";
import type { UploadInput } from "../shared/types";

export function logUploadFailure(
  options: KnowledgeBaseServiceOptions,
  event: string,
  input: UploadInput,
  fields: {
    documentId?: string;
    error: unknown;
    jobId?: string;
  },
): void {
  options.logger?.error(event, {
    actorId: input.actor.user.id,
    documentId: fields.documentId,
    ...createSafeErrorLogFields(fields.error, {
      message: "Document upload failed.",
    }),
    jobId: fields.jobId,
    knowledgeBaseId: input.knowledgeBaseId,
    requestId: input.requestId,
    tenantId: input.actor.tenant.id,
  });
}

export async function writeUploadAudit(
  db: KnowledgeDb,
  input: {
    action:
      | "auth.forbidden"
      | "document.duplicate_upload_ignored"
      | "document.upload_cleanup_failed"
      | "document.uploaded";
    documentId: string;
    input: UploadInput;
    jobId: string | null;
    metadata: Record<string, unknown>;
    targetType?: string;
  },
): Promise<void> {
  await recordAuditLog(db, {
    action: input.action,
    actorId: input.input.actor.user.id,
    actorType: "user",
    ipSummary: input.input.ipSummary,
    metadata: {
      ...input.metadata,
      ...(input.jobId === null ? {} : { jobId: input.jobId }),
    },
    requestId: input.input.requestId,
    targetId: input.documentId,
    targetType: input.targetType ?? "document",
    tenantId: input.input.actor.tenant.id,
    userAgentSummary: input.input.userAgentSummary,
  });
}
