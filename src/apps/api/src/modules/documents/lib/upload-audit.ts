import type { Context } from "hono";

import type { SessionPayload } from "@kb/auth";
import { createLogger, createSafeErrorLogFields } from "@kb/observability";

import type { ApiEnv } from "../../../contracts";
import { getRequestIpSummary } from "../../../guards";
import type { DocumentsRouteDependencies } from "../dependencies";

const uploadLogger = createLogger({ service: "api" });

export async function recordUploadSecurityFailure(
  context: Context<ApiEnv>,
  dependencies: DocumentsRouteDependencies,
  actor: SessionPayload,
  input: {
    metadata: Record<string, unknown>;
    knowledgeBaseId: string;
    reason: "oversized_file" | "spoofed_file_signature" | "unsupported_file_type";
  },
): Promise<void> {
  try {
    await dependencies.auditService.recordDocumentUploadSecurityFailure({
      actor,
      ipSummary: getRequestIpSummary(context),
      knowledgeBaseId: input.knowledgeBaseId,
      metadata: input.metadata,
      reason: input.reason,
      requestId: context.get("requestId"),
      userAgentSummary: context.req.header("user-agent") ?? null,
    });
  } catch (error) {
    uploadLogger.error("document_upload_security_audit_failed", {
      ...createSafeErrorLogFields(error, {
        message: "Document upload security audit failed.",
      }),
      reason: input.reason,
      requestId: context.get("requestId"),
    });
  }
}
