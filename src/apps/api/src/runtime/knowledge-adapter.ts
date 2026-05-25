import type {
  KnowledgeActor,
  KnowledgeBaseService as PackageKnowledgeBaseService,
} from "@kb/knowledge/service";

import type { DocumentService, KnowledgeBaseService } from "../contracts";

export interface KnowledgeServiceAdapters {
  documentService: DocumentService;
  knowledgeBaseService: KnowledgeBaseService;
}

export function createKnowledgeServiceAdapters(
  service: PackageKnowledgeBaseService,
): KnowledgeServiceAdapters {
  return {
    documentService: {
      uploadDocumentFile: (input) =>
        service.uploadDocumentFile({
          ...input,
          actor: normalizeKnowledgeActor(input.actor),
        }),
    },
    knowledgeBaseService: {
      createKnowledgeBase: (input) =>
        service.createKnowledgeBase({
          ...input,
          actor: normalizeKnowledgeActor(input.actor),
        }),
      getKnowledgeBase: (input) =>
        service.getKnowledgeBase({
          ...input,
          actor: normalizeKnowledgeActor(input.actor),
        }),
      listKnowledgeBases: (input) =>
        service.listKnowledgeBases({
          ...input,
          actor: normalizeKnowledgeActor(input.actor),
        }),
      updateKnowledgeBase: (input) =>
        service.updateKnowledgeBase({
          ...input,
          actor: normalizeKnowledgeActor(input.actor),
        }),
    },
  };
}

function normalizeKnowledgeActor(actor: KnowledgeActor): KnowledgeActor {
  return {
    role: actor.role,
    tenant: { id: actor.tenant.id },
    user: { id: actor.user.id },
  };
}
