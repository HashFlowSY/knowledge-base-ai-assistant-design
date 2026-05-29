import {
  actorIsKnowledgeBaseMember,
  findTenantKnowledgeBaseRow,
  type KnowledgeDb,
} from "../../../service/queries";
import {
  createForbiddenError,
  createNotFoundError,
} from "../../../service/errors";
import { writeUploadAudit } from "../observability/audit";
import type { UploadInput, UploadServiceError } from "../shared/types";

export async function authorizeUpload(
  db: KnowledgeDb,
  input: UploadInput,
): Promise<{ ok: true } | { ok: false; error: UploadServiceError }> {
  const knowledgeBase = await findTenantKnowledgeBaseRow(db, {
    knowledgeBaseId: input.knowledgeBaseId,
    tenantId: input.actor.tenant.id,
  });
  if (knowledgeBase === null) {
    return { error: createNotFoundError(), ok: false };
  }

  if (input.actor.role === "admin") {
    return { ok: true };
  }

  const isMember = await actorIsKnowledgeBaseMember(db, {
    actorId: input.actor.user.id,
    knowledgeBaseId: input.knowledgeBaseId,
    tenantId: input.actor.tenant.id,
  });
  if (!isMember) {
    await writeUploadAudit(db, {
      action: "auth.forbidden",
      documentId: input.knowledgeBaseId,
      input,
      jobId: null,
      metadata: {
        knowledgeBaseId: input.knowledgeBaseId,
        reason: "knowledge_base_upload_forbidden",
      },
      targetType: "knowledge_base",
    });

    return { error: createForbiddenError(), ok: false };
  }

  return { ok: true };
}
