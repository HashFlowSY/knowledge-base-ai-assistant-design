import { and, eq, isNull, sql, type SQL } from "drizzle-orm";

import { chatSessions, knowledgeBases } from "@kb/db";
import { createVisibleKnowledgeBaseConditions } from "@kb/knowledge/permissions";

import type { RagActor } from "./service-types";

export function createAccessibleChatSessionConditions(input: {
  actor: RagActor;
  knowledgeBaseId?: string;
  sessionId?: string;
}): SQL<unknown>[] {
  const conditions: SQL<unknown>[] = [
    eq(chatSessions.tenantId, input.actor.tenant.id),
    isNull(chatSessions.deletedAt),
    selectedKnowledgeBaseContainsAccessibleKnowledgeBase(input),
  ];

  if (input.actor.role === "member") {
    conditions.push(eq(chatSessions.userId, input.actor.user.id));
  }
  if (input.sessionId !== undefined) {
    conditions.push(eq(chatSessions.id, input.sessionId));
  }
  if (input.knowledgeBaseId !== undefined) {
    conditions.push(selectedKnowledgeBaseContains(input.knowledgeBaseId));
  }

  return conditions;
}

export function selectedKnowledgeBaseContains(
  knowledgeBaseId: string,
): SQL<unknown> {
  return sql`${chatSessions.selectedKnowledgeBaseIds} @> ${JSON.stringify([
    knowledgeBaseId,
  ])}::jsonb`;
}

export function selectedKnowledgeBaseContainsVisibleKnowledgeBase(): SQL<unknown> {
  return sql`${chatSessions.selectedKnowledgeBaseIds} @> jsonb_build_array(${knowledgeBases.id})`;
}

function selectedKnowledgeBaseContainsAccessibleKnowledgeBase(input: {
  actor: RagActor;
  knowledgeBaseId?: string;
}): SQL<unknown> {
  const conditions: SQL<unknown>[] = [
    selectedKnowledgeBaseContainsVisibleKnowledgeBase(),
    ...createVisibleKnowledgeBaseConditions(input.actor),
  ];
  if (input.knowledgeBaseId !== undefined) {
    conditions.push(eq(knowledgeBases.id, input.knowledgeBaseId));
  }

  return sql`exists (
    select 1
    from ${knowledgeBases}
    where ${and(...conditions)}
  )`;
}
