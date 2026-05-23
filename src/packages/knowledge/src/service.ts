import { createKnowledgeBaseOperation } from "./operations/create-knowledge-base";
import { getKnowledgeBaseOperation } from "./operations/get-knowledge-base";
import { listKnowledgeBasesOperation } from "./operations/list-knowledge-bases";
import { updateKnowledgeBaseOperation } from "./operations/update-knowledge-base";
import type {
  KnowledgeBaseService,
  KnowledgeBaseServiceOptions,
} from "./service-types";

export type {
  KnowledgeBaseService,
  KnowledgeBaseServiceOptions,
} from "./service-types";
export type { KnowledgeBaseServiceError } from "./service-errors";

export function createKnowledgeBaseService(
  options: KnowledgeBaseServiceOptions,
): KnowledgeBaseService {
  return {
    createKnowledgeBase: (input) => createKnowledgeBaseOperation(options, input),
    getKnowledgeBase: (input) => getKnowledgeBaseOperation(options, input),
    listKnowledgeBases: (input) => listKnowledgeBasesOperation(options, input),
    updateKnowledgeBase: (input) => updateKnowledgeBaseOperation(options, input),
  };
}
