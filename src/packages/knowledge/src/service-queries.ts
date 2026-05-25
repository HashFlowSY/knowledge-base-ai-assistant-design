import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

import {
  authUsers,
  documents,
  knowledgeBaseMembers,
  knowledgeBases,
  tenantMemberships,
  type ProjectDb,
} from "@kb/db";

import type { KnowledgeBaseListQuery } from "./schemas";
import type { KnowledgeBaseMemberRow, KnowledgeBaseRow } from "./service-mappers";
import type { KnowledgeActor } from "./service-types";

export type ProjectDbTransaction = Parameters<
  Parameters<ProjectDb["transaction"]>[0]
>[0];

export type KnowledgeDb = ProjectDb | ProjectDbTransaction;

export function createVisibleKnowledgeBaseConditions(
  actor: KnowledgeActor,
  query?: Pick<KnowledgeBaseListQuery, "search">,
): SQL<unknown>[] {
  const conditions: SQL<unknown>[] = [
    eq(knowledgeBases.tenantId, actor.tenant.id),
    isNull(knowledgeBases.deletedAt),
  ];

  if (actor.role === "member") {
    conditions.push(
      sql`exists (
        select 1
        from ${knowledgeBaseMembers}
        where ${knowledgeBaseMembers.tenantId} = ${knowledgeBases.tenantId}
          and ${knowledgeBaseMembers.knowledgeBaseId} = ${knowledgeBases.id}
          and ${knowledgeBaseMembers.userId} = ${actor.user.id}
      )`,
    );
  }

  if (query?.search !== undefined) {
    const pattern = `%${query.search}%`;
    const searchCondition = or(
      ilike(knowledgeBases.name, pattern),
      ilike(knowledgeBases.description, pattern),
    );
    if (searchCondition !== undefined) {
      conditions.push(searchCondition);
    }
  }

  return conditions;
}

export async function listVisibleKnowledgeBaseRows(
  db: KnowledgeDb,
  input: { actor: KnowledgeActor; query: KnowledgeBaseListQuery },
): Promise<{ items: KnowledgeBaseRow[]; total: number }> {
  const conditions = createVisibleKnowledgeBaseConditions(input.actor, input.query);
  const offset = (input.query.page - 1) * input.query.pageSize;
  const orderBy =
    input.query.sort === "name"
      ? [asc(knowledgeBases.name), asc(knowledgeBases.id)]
      : [desc(knowledgeBases.updatedAt), asc(knowledgeBases.id)];

  const [items, totalRows] = await Promise.all([
    db
      .select({
        createdAt: knowledgeBases.createdAt,
        description: knowledgeBases.description,
        id: knowledgeBases.id,
        name: knowledgeBases.name,
        updatedAt: knowledgeBases.updatedAt,
      })
      .from(knowledgeBases)
      .where(and(...conditions))
      .orderBy(...orderBy)
      .limit(input.query.pageSize)
      .offset(offset),
    db
      .select({ value: count() })
      .from(knowledgeBases)
      .where(and(...conditions)),
  ]);

  return {
    items,
    total: totalRows[0]?.value ?? 0,
  };
}

export async function findVisibleKnowledgeBaseRow(
  db: KnowledgeDb,
  input: { actor: KnowledgeActor; knowledgeBaseId: string },
): Promise<KnowledgeBaseRow | null> {
  const rows = await db
    .select({
      createdAt: knowledgeBases.createdAt,
      description: knowledgeBases.description,
      id: knowledgeBases.id,
      name: knowledgeBases.name,
      updatedAt: knowledgeBases.updatedAt,
    })
    .from(knowledgeBases)
    .where(
      and(
        ...createVisibleKnowledgeBaseConditions(input.actor),
        eq(knowledgeBases.id, input.knowledgeBaseId),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

export async function findTenantKnowledgeBaseRow(
  db: KnowledgeDb,
  input: { tenantId: string; knowledgeBaseId: string },
): Promise<KnowledgeBaseRow | null> {
  const rows = await db
    .select({
      createdAt: knowledgeBases.createdAt,
      description: knowledgeBases.description,
      id: knowledgeBases.id,
      name: knowledgeBases.name,
      updatedAt: knowledgeBases.updatedAt,
    })
    .from(knowledgeBases)
    .where(
      and(
        eq(knowledgeBases.tenantId, input.tenantId),
        eq(knowledgeBases.id, input.knowledgeBaseId),
        isNull(knowledgeBases.deletedAt),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

export async function actorIsKnowledgeBaseMember(
  db: KnowledgeDb,
  input: { actorId: string; knowledgeBaseId: string; tenantId: string },
): Promise<boolean> {
  const rows = await db
    .select({ id: knowledgeBaseMembers.id })
    .from(knowledgeBaseMembers)
    .where(
      and(
        eq(knowledgeBaseMembers.tenantId, input.tenantId),
        eq(knowledgeBaseMembers.knowledgeBaseId, input.knowledgeBaseId),
        eq(knowledgeBaseMembers.userId, input.actorId),
      ),
    )
    .limit(1);

  return rows[0] !== undefined;
}

export async function findDuplicateKnowledgeBaseName(
  db: KnowledgeDb,
  input: { excludeKnowledgeBaseId?: string; normalizedName: string; tenantId: string },
): Promise<{ id: string } | null> {
  const conditions: SQL<unknown>[] = [
    eq(knowledgeBases.tenantId, input.tenantId),
    isNull(knowledgeBases.deletedAt),
    sql`lower(trim(${knowledgeBases.name})) = ${input.normalizedName}`,
  ];

  if (input.excludeKnowledgeBaseId !== undefined) {
    conditions.push(ne(knowledgeBases.id, input.excludeKnowledgeBaseId));
  }

  const rows = await db
    .select({ id: knowledgeBases.id })
    .from(knowledgeBases)
    .where(and(...conditions))
    .limit(1);

  return rows[0] ?? null;
}

export async function listKnowledgeBaseMemberRows(
  db: KnowledgeDb,
  input: { knowledgeBaseIds: string[]; tenantId: string },
): Promise<KnowledgeBaseMemberRow[]> {
  if (input.knowledgeBaseIds.length === 0) {
    return [];
  }

  return db
    .select({
      email: authUsers.email,
      id: authUsers.id,
      knowledgeBaseId: knowledgeBaseMembers.knowledgeBaseId,
      name: authUsers.name,
    })
    .from(knowledgeBaseMembers)
    .innerJoin(authUsers, eq(authUsers.id, knowledgeBaseMembers.userId))
    .innerJoin(
      tenantMemberships,
      and(
        eq(tenantMemberships.userId, authUsers.id),
        eq(tenantMemberships.tenantId, input.tenantId),
        eq(tenantMemberships.isActive, true),
        eq(tenantMemberships.role, "member"),
      ),
    )
    .where(
      and(
        eq(knowledgeBaseMembers.tenantId, input.tenantId),
        inArray(knowledgeBaseMembers.knowledgeBaseId, input.knowledgeBaseIds),
      ),
    )
    .orderBy(asc(authUsers.name), asc(authUsers.id));
}

export async function listKnowledgeBaseDocumentCounts(
  db: KnowledgeDb,
  input: { knowledgeBaseIds: string[]; tenantId: string },
): Promise<Map<string, number>> {
  if (input.knowledgeBaseIds.length === 0) {
    return new Map();
  }

  const rows = await db
    .select({
      knowledgeBaseId: documents.knowledgeBaseId,
      value: count(),
    })
    .from(documents)
    .where(
      and(
        eq(documents.tenantId, input.tenantId),
        isNull(documents.deletedAt),
        inArray(documents.knowledgeBaseId, input.knowledgeBaseIds),
      ),
    )
    .groupBy(documents.knowledgeBaseId);

  return new Map(rows.map((row) => [row.knowledgeBaseId, row.value]));
}

export async function listValidMemberIds(
  db: KnowledgeDb,
  input: { memberIds: string[]; tenantId: string },
): Promise<Set<string>> {
  if (input.memberIds.length === 0) {
    return new Set();
  }

  const rows = await db
    .select({ id: authUsers.id })
    .from(authUsers)
    .innerJoin(
      tenantMemberships,
      and(
        eq(tenantMemberships.userId, authUsers.id),
        eq(tenantMemberships.tenantId, input.tenantId),
        eq(tenantMemberships.isActive, true),
        eq(tenantMemberships.role, "member"),
      ),
    )
    .where(inArray(authUsers.id, input.memberIds));

  return new Set(rows.map((row) => row.id));
}
