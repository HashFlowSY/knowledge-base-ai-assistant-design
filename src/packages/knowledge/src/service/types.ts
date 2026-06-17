import type { ProjectDb } from "@kb/db";
import type { Logger } from "@kb/observability";
import type { IngestionQueueProducer } from "@kb/queue/producer";
import type { ObjectStorageClient } from "@kb/storage";

import type {
  CreateKnowledgeBaseInput,
  DocumentFileUploadResult,
  DocumentProcessingListQuery,
  DocumentProcessingPage,
  KnowledgeBaseDetail,
  KnowledgeBaseListQuery,
  KnowledgeBaseSummary,
  KnowledgeBasesPage,
  RetryDocumentProcessingResult,
  UpdateKnowledgeBaseInput,
} from "../contracts/schemas";

export interface KnowledgeActor {
  user: { id: string };
  tenant: { id: string };
  role: "admin" | "member";
}

export interface KnowledgeBaseServiceOptions {
  db: ProjectDb;
  ingestionQueue?: {
    attempts: number;
  };
  ingestionQueueProducer?: IngestionQueueProducer;
  logger?: Logger;
  objectStorage?: ObjectStorageClient;
  sourceBucket?: string;
}

export interface KnowledgeBaseService {
  listKnowledgeBases(input: {
    actor: KnowledgeActor;
    query: KnowledgeBaseListQuery;
  }): Promise<{ ok: true; page: KnowledgeBasesPage }>;
  getKnowledgeBase(input: {
    actor: KnowledgeActor;
    knowledgeBaseId: string;
  }): Promise<{ ok: true; knowledgeBase: KnowledgeBaseDetail }>;
  createKnowledgeBase(input: {
    actor: KnowledgeActor;
    body: CreateKnowledgeBaseInput;
  }): Promise<{ ok: true; knowledgeBase: KnowledgeBaseSummary }>;
  updateKnowledgeBase(input: {
    actor: KnowledgeActor;
    body: UpdateKnowledgeBaseInput;
    knowledgeBaseId: string;
  }): Promise<{ ok: true; knowledgeBase: KnowledgeBaseDetail }>;
  uploadDocumentFile(input: {
    actor: KnowledgeActor;
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
  }): Promise<{ ok: true; result: DocumentFileUploadResult }>;
  retryDocumentProcessing(input: {
    actor: KnowledgeActor;
    documentId: string;
    knowledgeBaseId: string;
  }): Promise<{ ok: true; result: RetryDocumentProcessingResult }>;
  listDocumentProcessing(input: {
    actor: KnowledgeActor;
    knowledgeBaseId: string;
    query: DocumentProcessingListQuery;
  }): Promise<{ ok: true; page: DocumentProcessingPage }>;
}
