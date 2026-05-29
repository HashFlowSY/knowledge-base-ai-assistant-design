import { createKnowledgeBaseOperation } from "./operations/knowledge-bases/create";
import { getKnowledgeBaseOperation } from "./operations/knowledge-bases/get";
import { listKnowledgeBasesOperation } from "./operations/knowledge-bases/list";
import { updateKnowledgeBaseOperation } from "./operations/knowledge-bases/update";
import { uploadDocumentFileOperation } from "./operations/upload-document-file/index";
import type {
  KnowledgeBaseService,
  KnowledgeBaseServiceOptions,
} from "./service/types";

export type {
  KnowledgeActor,
  KnowledgeBaseService,
  KnowledgeBaseServiceOptions,
} from "./service/types";
export type { KnowledgeBaseServiceError } from "./service/errors";

export function createKnowledgeBaseService(
  options: KnowledgeBaseServiceOptions,
): KnowledgeBaseService {
  return {
    createKnowledgeBase: (input) => createKnowledgeBaseOperation(options, input),
    getKnowledgeBase: (input) => getKnowledgeBaseOperation(options, input),
    listKnowledgeBases: (input) => listKnowledgeBasesOperation(options, input),
    uploadDocumentFile: (input) => uploadDocumentFileOperation(options, input),
    updateKnowledgeBase: (input) => updateKnowledgeBaseOperation(options, input),
  };
}
