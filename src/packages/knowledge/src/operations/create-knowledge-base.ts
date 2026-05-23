import { sql } from "drizzle-orm";

import { knowledgeBaseMembers, knowledgeBases } from "@kb/db";

import { normalizeKnowledgeBaseName } from "../schemas";
import {
  createConflictError,
  createForbiddenError,
  createInternalError,
  createInvalidMembersError,
  fromServiceException,
  toServiceException,
} from "../service-errors";
import {
  createKnowledgeBaseSlug,
  groupMembersByKnowledgeBaseId,
} from "../service-helpers";
import {
  findDuplicateKnowledgeBaseName,
  listKnowledgeBaseDocumentCounts,
  listKnowledgeBaseMemberRows,
  listValidMemberIds,
  type KnowledgeDb,
} from "../service-queries";
import { toKnowledgeBaseSummary } from "../service-mappers";
import type {
  KnowledgeBaseService,
  KnowledgeBaseServiceOptions,
} from "../service-types";

export async function createKnowledgeBaseOperation(
  options: KnowledgeBaseServiceOptions,
  input: Parameters<KnowledgeBaseService["createKnowledgeBase"]>[0],
): ReturnType<KnowledgeBaseService["createKnowledgeBase"]> {
  if (input.actor.role !== "admin") {
    return createForbiddenError();
  }

  try {
    return await options.db.transaction(async (tx) => {
      await assertKnowledgeBaseNameAvailable(tx, {
        name: input.body.name,
        tenantId: input.actor.tenant.id,
      });
      await assertMemberIdsAreValid(tx, {
        memberIds: input.body.memberIds,
        tenantId: input.actor.tenant.id,
      });

      const rows = await tx
        .insert(knowledgeBases)
        .values({
          createdByUserId: input.actor.user.id,
          description: input.body.description,
          name: input.body.name,
          slug: createKnowledgeBaseSlug(input.body.name),
          tenantId: input.actor.tenant.id,
          updatedAt: sql`NOW()`,
          visibility: "private",
        })
        .returning({
          createdAt: knowledgeBases.createdAt,
          description: knowledgeBases.description,
          id: knowledgeBases.id,
          name: knowledgeBases.name,
          updatedAt: knowledgeBases.updatedAt,
        });
      const row = rows[0];
      if (row === undefined) {
        throw toServiceException(createInternalError());
      }

      await insertKnowledgeBaseMembers(tx, {
        knowledgeBaseId: row.id,
        memberIds: input.body.memberIds,
        tenantId: input.actor.tenant.id,
      });

      const [memberRows, documentCounts] = await Promise.all([
        listKnowledgeBaseMemberRows(tx, {
          knowledgeBaseIds: [row.id],
          tenantId: input.actor.tenant.id,
        }),
        listKnowledgeBaseDocumentCounts(tx, {
          knowledgeBaseIds: [row.id],
          tenantId: input.actor.tenant.id,
        }),
      ]);
      const membersByKnowledgeBaseId = groupMembersByKnowledgeBaseId(memberRows);

      return {
        knowledgeBase: toKnowledgeBaseSummary(row, {
          documentCount: documentCounts.get(row.id) ?? 0,
          members: membersByKnowledgeBaseId.get(row.id) ?? [],
        }),
        ok: true,
      };
    });
  } catch (error) {
    return fromServiceException(error);
  }
}

export async function assertKnowledgeBaseNameAvailable(
  db: KnowledgeDb,
  input: {
    excludeKnowledgeBaseId?: string;
    name: string;
    tenantId: string;
  },
): Promise<void> {
  const normalizedName = normalizeKnowledgeBaseName(input.name);

  await db.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`knowledge-base:${input.tenantId}`}), hashtext(${normalizedName}))`,
  );

  const duplicate = await findDuplicateKnowledgeBaseName(db, {
    normalizedName,
    tenantId: input.tenantId,
    ...(input.excludeKnowledgeBaseId === undefined
      ? {}
      : { excludeKnowledgeBaseId: input.excludeKnowledgeBaseId }),
  });
  if (duplicate !== null) {
    throw toServiceException(createConflictError());
  }
}

export async function assertMemberIdsAreValid(
  db: KnowledgeDb,
  input: { memberIds: string[]; tenantId: string },
): Promise<void> {
  const validMemberIds = await listValidMemberIds(db, input);
  const hasInvalidMember = input.memberIds.some(
    (memberId) => !validMemberIds.has(memberId),
  );
  if (hasInvalidMember) {
    throw toServiceException(createInvalidMembersError());
  }
}

export async function insertKnowledgeBaseMembers(
  db: KnowledgeDb,
  input: { knowledgeBaseId: string; memberIds: string[]; tenantId: string },
): Promise<void> {
  if (input.memberIds.length === 0) {
    return;
  }

  await db.insert(knowledgeBaseMembers).values(
    input.memberIds.map((memberId) => ({
      knowledgeBaseId: input.knowledgeBaseId,
      role: "member" as const,
      tenantId: input.tenantId,
      userId: memberId,
    })),
  );
}
