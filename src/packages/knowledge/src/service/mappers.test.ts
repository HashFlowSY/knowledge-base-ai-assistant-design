import { describe, expect, it } from "vitest";

import {
  toDocumentProcessingSummary,
  type DocumentProcessingDocumentRow,
  type DocumentProcessingJobRow,
  type DocumentProcessingSourceRow,
} from "./mappers";

describe("knowledge service mappers", () => {
  it("only marks failed file processing with an available source object as retryable", () => {
    expect(
      mapDocumentProcessingRetryable({
        objectCleanupStatus: "not_required",
        objectKey: "tenants/tenant_1/source.txt",
        sourceType: "file",
        uploadStatus: "available",
      }),
    ).toBe(true);

    expect(
      mapDocumentProcessingRetryable({
        objectCleanupStatus: "not_required",
        objectKey: "https://example.com/source.html",
        sourceType: "url",
        uploadStatus: "available",
      }),
    ).toBe(false);

    expect(
      mapDocumentProcessingRetryable({
        objectCleanupStatus: "not_required",
        objectKey: null,
        sourceType: "file",
        uploadStatus: "available",
      }),
    ).toBe(false);

    expect(
      mapDocumentProcessingRetryable({
        objectCleanupStatus: "not_required",
        objectKey: "tenants/tenant_1/source.txt",
        sourceType: "file",
        uploadStatus: "upload_failed",
      }),
    ).toBe(false);

    expect(
      mapDocumentProcessingRetryable({
        objectCleanupStatus: "pending_cleanup",
        objectKey: "tenants/tenant_1/source.txt",
        sourceType: "file",
        uploadStatus: "available",
      }),
    ).toBe(false);

    expect(
      toDocumentProcessingSummary(documentRow(), {
        job: {
          ...failedRetryableJob(),
          attempts: 3,
          maxAttempts: 3,
        },
        progress: { chunkCount: 12, embeddedCount: 8 },
        source: {
          objectCleanupStatus: "not_required",
          objectKey: "tenants/tenant_1/source.txt",
          sourceType: "file",
          uploadStatus: "available",
        },
      }).job?.canRetry,
    ).toBe(false);
  });

  it("maps raw operational errors to safe document processing messages", () => {
    const summary = toDocumentProcessingSummary(documentRow(), {
      job: {
        ...failedRetryableJob(),
        lastErrorCode: "PROVIDER_UNAVAILABLE",
        lastErrorMessage:
          "S3 AccessDenied tenants/tenant_1/knowledge-bases/kb_1/private.pdf",
      },
      progress: { chunkCount: null, embeddedCount: null },
      source: {
        objectCleanupStatus: "cleanup_failed",
        objectKey: "tenants/tenant_1/source.txt",
        sourceType: "file",
        uploadStatus: "available",
      },
    });

    expect(summary.job?.lastErrorMessage).toBe("模型服务暂时不可用，请稍后重试。");
    expect(JSON.stringify(summary)).not.toContain("tenants/tenant_1");
    expect(summary.source).toEqual({
      objectCleanupStatus: "cleanup_failed",
    });
  });
});

function mapDocumentProcessingRetryable(
  source: Pick<
    DocumentProcessingSourceRow,
    "objectCleanupStatus" | "objectKey" | "sourceType" | "uploadStatus"
  >,
): boolean {
  const summary = toDocumentProcessingSummary(documentRow(), {
    job: failedRetryableJob(),
    progress: { chunkCount: 12, embeddedCount: 8 },
    source: {
      ...source,
    },
  });

  return summary.job?.canRetry ?? false;
}

function documentRow(): DocumentProcessingDocumentRow {
  return {
    currentVersion: 1,
    id: "doc_1",
    status: "failed",
    title: "采购制度",
    updatedAt: new Date("2026-05-23T06:00:00.000Z"),
  };
}

function failedRetryableJob(): DocumentProcessingJobRow {
  return {
    attempts: 1,
    currentStep: "embedding",
    id: "job_1",
    lastErrorCode: "PROVIDER_UNAVAILABLE",
    lastErrorMessage: "模型服务暂时不可用。",
    maxAttempts: 3,
    status: "failed",
    updatedAt: new Date("2026-05-23T06:00:00.000Z"),
  };
}
