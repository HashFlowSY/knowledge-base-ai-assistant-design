import type {
  DocumentProcessingSummary,
  KnowledgeBaseDetail,
  KnowledgeBaseMemberSummary,
  KnowledgeBaseSummary,
} from "../contracts/schemas";

export interface KnowledgeBaseRow {
  createdAt: Date;
  description: string | null;
  id: string;
  name: string;
  updatedAt: Date;
}

export interface KnowledgeBaseMemberRow {
  email: string;
  id: string;
  knowledgeBaseId: string;
  name: string;
}

export interface DocumentProcessingDocumentRow {
  currentVersion: number;
  id: string;
  status: DocumentProcessingSummary["status"];
  title: string;
  updatedAt: Date;
}

export interface DocumentProcessingJobRow {
  attempts: number;
  currentStep: NonNullable<DocumentProcessingSummary["job"]>["currentStep"];
  id: string;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  maxAttempts: number;
  status: NonNullable<DocumentProcessingSummary["job"]>["status"];
  updatedAt: Date;
}

export interface DocumentProcessingSourceRow {
  objectKey: string | null;
  objectCleanupStatus: NonNullable<
    DocumentProcessingSummary["source"]
  >["objectCleanupStatus"];
  sourceType: "file" | "url";
  uploadStatus: "pending_upload" | "available" | "upload_failed";
}

export function toKnowledgeBaseSummary(
  row: KnowledgeBaseRow,
  input: {
    documentCount: number;
    members: KnowledgeBaseMemberSummary[];
  },
): KnowledgeBaseSummary {
  return {
    createdAt: row.createdAt.toISOString(),
    description: row.description,
    documentCount: input.documentCount,
    id: row.id,
    memberCount: input.members.length,
    members: input.members,
    name: row.name,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toKnowledgeBaseDetail(
  row: KnowledgeBaseRow,
  input: {
    documentCount: number;
    members: KnowledgeBaseMemberSummary[];
  },
): KnowledgeBaseDetail {
  return toKnowledgeBaseSummary(row, input);
}

export function toDocumentProcessingSummary(
  row: DocumentProcessingDocumentRow,
  input: {
    job: DocumentProcessingJobRow | null;
    progress: DocumentProcessingSummary["progress"];
    source: DocumentProcessingSourceRow | null;
  },
): DocumentProcessingSummary {
  return {
    currentVersion: row.currentVersion,
    id: row.id,
    job:
      input.job === null
        ? null
        : {
            attempts: input.job.attempts,
            canRetry: canRetryDocumentProcessing(input.job, input.source),
            currentStep: input.job.currentStep,
            id: input.job.id,
            lastErrorCode: input.job.lastErrorCode,
            lastErrorMessage: toPublicDocumentProcessingErrorMessage(input.job),
            maxAttempts: input.job.maxAttempts,
            status: input.job.status,
            updatedAt: input.job.updatedAt.toISOString(),
          },
    progress: input.progress,
    source:
      input.source === null
        ? null
        : {
            objectCleanupStatus: input.source.objectCleanupStatus,
          },
    status: row.status,
    title: row.title,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toPublicDocumentProcessingErrorMessage(
  job: DocumentProcessingJobRow,
): string | null {
  if (job.status !== "failed" && job.status !== "retrying") {
    return null;
  }

  switch (job.lastErrorCode) {
    case null:
      return job.lastErrorMessage === null ? null : "文档处理失败，请稍后重试。";
    case "UNSUPPORTED_DOCUMENT_TYPE":
      return "不支持该文档类型，请上传 PDF、Markdown 或 TXT 文件。";
    case "PARSE_EMPTY_TEXT":
      return "文档未提取到可处理文本，请确认文件内容后重试。";
    case "INVALID_CHUNKING_CONFIG":
      return "文档分段配置无效，请联系管理员处理。";
    case "EMBEDDING_PROVIDER_NOT_CONFIGURED":
      return "向量化服务尚未配置，请联系管理员处理。";
    case "PROVIDER_AUTH_FAILED":
    case "PROVIDER_INVALID_REQUEST":
    case "PROVIDER_RATE_LIMITED":
    case "PROVIDER_TIMEOUT":
    case "PROVIDER_UNAVAILABLE":
    case "PROVIDER_UNKNOWN_ERROR":
      return "模型服务暂时不可用，请稍后重试。";
    case "QUEUE_ENQUEUE_FAILED":
      return "处理任务排队失败，系统会自动重试。";
    default:
      return "文档处理失败，请稍后重试。";
  }
}

function canRetryDocumentProcessing(
  job: DocumentProcessingJobRow,
  source: DocumentProcessingSourceRow | null,
): boolean {
  return (
    job.status === "failed" &&
    job.attempts < job.maxAttempts &&
    source?.sourceType === "file" &&
    source.uploadStatus === "available" &&
    source.objectKey !== null &&
    source.objectCleanupStatus === "not_required"
  );
}
