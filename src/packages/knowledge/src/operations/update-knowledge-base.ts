import { and, eq, sql } from "drizzle-orm";

import { knowledgeBaseMembers, knowledgeBases } from "@kb/db";

import {
  assertKnowledgeBaseNameAvailable,
  assertMemberIdsAreValid,
  insertKnowledgeBaseMembers,
} from "./create-knowledge-base";
import {
  createForbiddenError,
  createInternalError,
  createNotFoundError,
  fromServiceException,
  toServiceException,
} from "../service-errors";
import {
  createKnowledgeBaseSlug,
  groupMembersByKnowledgeBaseId,
} from "../service-helpers";
import {
  findTenantKnowledgeBaseRow,
  listKnowledgeBaseDocumentCounts,
  listKnowledgeBaseMemberRows,
} from "../service-queries";
import { toKnowledgeBaseDetail } from "../service-mappers";
import type {
  KnowledgeBaseService,
  KnowledgeBaseServiceOptions,
} from "../service-types";

export async function updateKnowledgeBaseOperation(
  options: KnowledgeBaseServiceOptions,
  input: Parameters<KnowledgeBaseService["updateKnowledgeBase"]>[0],
): ReturnType<KnowledgeBaseService["updateKnowledgeBase"]> {
  if (input.actor.role !== "admin") {
    return createForbiddenError();
  }

  try {
    return await options.db.transaction(async (tx) => {
      const existing = await findTenantKnowledgeBaseRow(tx, {
        knowledgeBaseId: input.knowledgeBaseId,
        tenantId: input.actor.tenant.id,
      });
      if (existing === null) {
        throw toServiceException(createNotFoundError());
      }

      if (input.body.name !== undefined) {
        await assertKnowledgeBaseNameAvailable(tx, {
          excludeKnowledgeBaseId: input.knowledgeBaseId,
          name: input.body.name,
          tenantId: input.actor.tenant.id,
        });
      }

      if (input.body.memberIds !== undefined) {
        await assertMemberIdsAreValid(tx, {
          memberIds: input.body.memberIds,
          tenantId: input.actor.tenant.id,
        });
      }

      const rows = await tx
        .update(knowledgeBases)
        .set({
          ...(input.body.name === undefined
            ? {}
            : {
                name: input.body.name,
                slug: createKnowledgeBaseSlug(input.body.name),
              }),
          ...(Object.hasOwn(input.body, "description")
            ? { description: input.body.description }
            : {}),
          updatedAt: sql`NOW()`,
        })
        .where(
          and(
            eq(knowledgeBases.tenantId, input.actor.tenant.id),
            eq(knowledgeBases.id, input.knowledgeBaseId),
          ),
        )
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

      if (input.body.memberIds !== undefined) {
        await tx
          .delete(knowledgeBaseMembers)
          .where(
            and(
              eq(knowledgeBaseMembers.tenantId, input.actor.tenant.id),
              eq(knowledgeBaseMembers.knowledgeBaseId, input.knowledgeBaseId),
            ),
          );
        await insertKnowledgeBaseMembers(tx, {
          knowledgeBaseId: input.knowledgeBaseId,
          memberIds: input.body.memberIds,
          tenantId: input.actor.tenant.id,
        });
      }

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
        knowledgeBase: toKnowledgeBaseDetail(row, {
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
