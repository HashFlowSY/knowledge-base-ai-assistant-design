import { and, eq } from "drizzle-orm";

import { knowledgeBases } from "@kb/db";

import {
  createVisibleKnowledgeBaseConditions,
  type KnowledgeDb,
} from "./queries";
import type { KnowledgeActor } from "./types";

export { createVisibleKnowledgeBaseConditions };

export async function actorCanAccessKnowledgeBase(
  db: KnowledgeDb,
  input: { actor: KnowledgeActor; knowledgeBaseId: string },
): Promise<boolean> {
  const rows = await db
    .select({ id: knowledgeBases.id })
    .from(knowledgeBases)
    .where(
      and(
        ...createVisibleKnowledgeBaseConditions(input.actor),
        eq(knowledgeBases.id, input.knowledgeBaseId),
      ),
    )
    .limit(1);

  return rows[0] !== undefined;
}
