import type { SessionPayload } from "@kb/auth";

export type SessionGuardResult = Promise<
  { ok: true; actor: SessionPayload } | { ok: false; response: Response }
>;
