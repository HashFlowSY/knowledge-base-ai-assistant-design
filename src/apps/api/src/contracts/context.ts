import type { Logger } from "@kb/observability";
import type { SessionPayload } from "@kb/auth";

export interface ApiContextVariables {
  actor: SessionPayload | null;
  documentUpload: { actor: SessionPayload; knowledgeBaseId: string } | null;
  jsonBody: unknown;
  jsonBodyRead: boolean;
  logger: Logger;
  rateLimitCounted: boolean;
  requestId: string;
  session: SessionPayload | null;
  tenantId: string | null;
  validatedInputs: Record<string, unknown>;
}

export interface ApiEnv {
  Variables: ApiContextVariables;
}
