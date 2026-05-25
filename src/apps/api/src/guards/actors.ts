import type { SessionPayload } from "@kb/auth";
import type { KnowledgeActor } from "@kb/knowledge";

export function toKnowledgeActor(actor: SessionPayload): KnowledgeActor {
  return {
    role: actor.role,
    tenant: { id: actor.tenant.id },
    user: { id: actor.user.id },
  };
}
