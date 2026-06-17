import type { SessionPayload } from "@kb/auth";

export type SessionGuardResult = Promise<{ actor: SessionPayload }>;
