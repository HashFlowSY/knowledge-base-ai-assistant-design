import type { SessionPayload } from "@kb/auth";
import type { ProjectDb } from "@kb/db";
import type { ObjectStorageClient } from "@kb/storage";

import type {
  CreateKnowledgeBaseInput,
  DocumentFileUploadResult,
  KnowledgeBaseDetail,
  KnowledgeBaseListQuery,
  KnowledgeBaseSummary,
  KnowledgeBasesPage,
  UpdateKnowledgeBaseInput,
} from "./schemas";
import type { KnowledgeBaseServiceError } from "./service-errors";

export interface KnowledgeBaseServiceOptions {
  db: ProjectDb;
  objectStorage?: ObjectStorageClient;
  sourceBucket?: string;
}

export interface KnowledgeBaseService {
  listKnowledgeBases(input: {
    actor: SessionPayload;
    query: KnowledgeBaseListQuery;
  }): Promise<{ ok: true; page: KnowledgeBasesPage } | KnowledgeBaseServiceError>;
  getKnowledgeBase(input: {
    actor: SessionPayload;
    knowledgeBaseId: string;
  }): Promise<{ ok: true; knowledgeBase: KnowledgeBaseDetail } | KnowledgeBaseServiceError>;
  createKnowledgeBase(input: {
    actor: SessionPayload;
    body: CreateKnowledgeBaseInput;
  }): Promise<{ ok: true; knowledgeBase: KnowledgeBaseSummary } | KnowledgeBaseServiceError>;
  updateKnowledgeBase(input: {
    actor: SessionPayload;
    body: UpdateKnowledgeBaseInput;
    knowledgeBaseId: string;
  }): Promise<{ ok: true; knowledgeBase: KnowledgeBaseDetail } | KnowledgeBaseServiceError>;
  uploadDocumentFile(input: {
    actor: SessionPayload;
    checksum: string;
    content: Uint8Array;
    ipSummary: string;
    knowledgeBaseId: string;
    mimeType: string;
    originalFilename: string;
    requestId: string;
    sizeBytes: number;
    title: string;
    userAgentSummary: string | null;
  }): Promise<
    { ok: true; result: DocumentFileUploadResult } | KnowledgeBaseServiceError
  >;
}
