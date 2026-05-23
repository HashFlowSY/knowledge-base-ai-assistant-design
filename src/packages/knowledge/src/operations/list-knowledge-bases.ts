import {
  getKnowledgeBaseIds,
  groupMembersByKnowledgeBaseId,
} from "../service-helpers";
import {
  listKnowledgeBaseDocumentCounts,
  listKnowledgeBaseMemberRows,
  listVisibleKnowledgeBaseRows,
} from "../service-queries";
import { toKnowledgeBaseSummary } from "../service-mappers";
import type {
  KnowledgeBaseService,
  KnowledgeBaseServiceOptions,
} from "../service-types";

export async function listKnowledgeBasesOperation(
  options: KnowledgeBaseServiceOptions,
  input: Parameters<KnowledgeBaseService["listKnowledgeBases"]>[0],
): ReturnType<KnowledgeBaseService["listKnowledgeBases"]> {
  const { items, total } = await listVisibleKnowledgeBaseRows(options.db, input);
  const knowledgeBaseIds = getKnowledgeBaseIds(items);
  const [memberRows, documentCounts] = await Promise.all([
    listKnowledgeBaseMemberRows(options.db, {
      knowledgeBaseIds,
      tenantId: input.actor.tenant.id,
    }),
    listKnowledgeBaseDocumentCounts(options.db, {
      knowledgeBaseIds,
      tenantId: input.actor.tenant.id,
    }),
  ]);
  const membersByKnowledgeBaseId = groupMembersByKnowledgeBaseId(memberRows);

  return {
    ok: true,
    page: {
      items: items.map((row) =>
        toKnowledgeBaseSummary(row, {
          documentCount: documentCounts.get(row.id) ?? 0,
          members: membersByKnowledgeBaseId.get(row.id) ?? [],
        }),
      ),
      page: input.query.page,
      pageSize: input.query.pageSize,
      total,
    },
  };
}
