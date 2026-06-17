import type { AppError } from "@kb/errors";

import type { DocumentFileUploadResult } from "../../../contracts/schemas";
import type { KnowledgeBaseService } from "../../../service/types";

export type UploadInput = Parameters<KnowledgeBaseService["uploadDocumentFile"]>[0];
export type UploadResult = Awaited<
  ReturnType<KnowledgeBaseService["uploadDocumentFile"]>
>;
export type UploadServiceError = AppError;

export interface ReservedUpload {
  documentId: string;
  jobId: string;
  objectKey: string;
  sourceId: string;
}

export interface UploadResultRow {
  documentCreatedAt: Date;
  documentCurrentVersion: number;
  documentId: string;
  knowledgeBaseId: string;
  documentStatus: "pending" | "processing" | "ready" | "failed" | "archived";
  documentTitle: string;
  documentUpdatedAt: Date;
  jobCreatedAt: Date;
  jobId: string;
  jobQueuedAt: Date;
  jobSourceHash: string | null;
  jobStatus:
    | "pending_source"
    | "queued"
    | "running"
    | "retrying"
    | "completed"
    | "failed"
    | "cancelled";
  jobUpdatedAt: Date;
  sourceBucket: string;
  sourceHash: string;
  sourceId: string;
  sourceMimeType: string | null;
  sourceObjectKey: string | null;
  sourceSizeBytes: number | null;
  sourceUri: string;
  sourceScanStatus:
    | "not_scanned"
    | "pending"
    | "clean"
    | "infected"
    | "scan_failed";
  sourceUploadedAt: Date | null;
  sourceUploadStatus: "pending_upload" | "available" | "upload_failed";
}

export type UploadResultWithoutDuplicate = Omit<
  DocumentFileUploadResult,
  "duplicate"
>;
