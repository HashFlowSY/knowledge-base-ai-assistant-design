import { createNotFoundError } from "../../service/errors";
import { toDocumentProcessingSummary } from "../../service/mappers";
import {
  findVisibleKnowledgeBaseRow,
  listKnowledgeBaseDocumentProcessingSummaries,
} from "../../service/queries";
import type {
  KnowledgeBaseService,
  KnowledgeBaseServiceOptions,
} from "../../service/types";

type ListDocumentProcessingInput = Parameters<
  KnowledgeBaseService["listDocumentProcessing"]
>[0];

export async function listDocumentProcessingOperation(
  options: KnowledgeBaseServiceOptions,
  input: ListDocumentProcessingInput,
): ReturnType<KnowledgeBaseService["listDocumentProcessing"]> {
  const knowledgeBase = await findVisibleKnowledgeBaseRow(options.db, {
    actor: input.actor,
    knowledgeBaseId: input.knowledgeBaseId,
  });
  if (knowledgeBase === null) {
    return createNotFoundError();
  }

  const page = await listKnowledgeBaseDocumentProcessingSummaries(options.db, {
    knowledgeBaseId: input.knowledgeBaseId,
    query: input.query,
    tenantId: input.actor.tenant.id,
  });

  return {
    ok: true,
    page: {
      items: page.items.map((processingRow) =>
        toDocumentProcessingSummary(processingRow.document, {
          job: processingRow.job,
          progress: processingRow.progress,
          source: processingRow.source,
        }),
      ),
      page: input.query.page,
      pageSize: input.query.pageSize,
      total: page.total,
    },
  };
}
