import { createNotFoundError } from "../../service/errors";
import { groupMembersByKnowledgeBaseId } from "../../service/helpers";
import {
  findVisibleKnowledgeBaseRow,
  listKnowledgeBaseDocumentCounts,
  listKnowledgeBaseMemberRows,
} from "../../service/queries";
import { toKnowledgeBaseDetail } from "../../service/mappers";
import type {
  KnowledgeBaseService,
  KnowledgeBaseServiceOptions,
} from "../../service/types";

export async function getKnowledgeBaseOperation(
  options: KnowledgeBaseServiceOptions,
  input: Parameters<KnowledgeBaseService["getKnowledgeBase"]>[0],
): ReturnType<KnowledgeBaseService["getKnowledgeBase"]> {
  const row = await findVisibleKnowledgeBaseRow(options.db, input);
  if (row === null) {
    throw createNotFoundError();
  }

  const [memberRows, documentCounts] = await Promise.all([
    listKnowledgeBaseMemberRows(options.db, {
      knowledgeBaseIds: [row.id],
      tenantId: input.actor.tenant.id,
    }),
    listKnowledgeBaseDocumentCounts(options.db, {
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
}
