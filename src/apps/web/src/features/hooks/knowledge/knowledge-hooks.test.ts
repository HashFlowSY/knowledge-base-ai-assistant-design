import { describe, expect, it } from "vitest";
import type { InfiniteData } from "@tanstack/react-query";

import type {
  DocumentProcessingPage,
  DocumentProcessingSummary,
} from "@kb/knowledge";

import { apiClient } from "../../api/client";
import {
  documentProcessingQueryRootKey,
  hasActiveDocumentProcessing,
  infiniteDocumentProcessingQueryKey,
  infiniteKnowledgeBasesQueryKey,
  knowledgeBaseDocumentRetryMutationKey,
  knowledgeBaseQueryKey,
  knowledgeBasesQueryKey,
  replaceDocumentProcessingDocument,
  useInfiniteDocumentProcessing,
  useRetryDocumentProcessing,
  useUploadDocumentFile,
} from "./knowledge-hooks";

const timestamp = "2026-06-05T08:00:00.000Z";

describe("knowledge hooks", () => {
  it("builds stable query keys from list and detail inputs", () => {
    expect(
      knowledgeBasesQueryKey({
        page: 2,
        pageSize: 8,
        search: "合同",
        sort: "name",
      }),
    ).toEqual([
      "knowledge-bases",
      { page: 2, pageSize: 8, search: "合同", sort: "name" },
    ]);
    expect(
      infiniteKnowledgeBasesQueryKey({
        pageSize: 8,
        search: "合同",
        sort: "updated",
      }),
    ).toEqual([
      "knowledge-bases",
      "infinite",
      { pageSize: 8, search: "合同", sort: "updated" },
    ]);
    expect(knowledgeBaseQueryKey("kb_1")).toEqual(["knowledge-bases", "kb_1"]);
    expect(knowledgeBaseQueryKey(null)).toEqual(["knowledge-bases", null]);
    expect(documentProcessingQueryRootKey("kb_1")).toEqual([
      "knowledge-bases",
      "kb_1",
      "documents",
      "processing",
    ]);
    expect(infiniteDocumentProcessingQueryKey("kb_1", { pageSize: 8 })).toEqual([
      "knowledge-bases",
      "kb_1",
      "documents",
      "processing",
      "infinite",
      { pageSize: 8 },
    ]);
    expect(knowledgeBaseDocumentRetryMutationKey("kb_1", "doc_1")).toEqual([
      "knowledge-bases",
      "kb_1",
      "documents",
      "doc_1",
      "retry",
    ]);
  });

  it("exposes the typed knowledge-base RPC routes on the browser API client", () => {
    expect(apiClient.api["knowledge-bases"].$get).toBeTypeOf("function");
    expect(apiClient.api["knowledge-bases"].$post).toBeTypeOf("function");
    expect(apiClient.api["knowledge-bases"][":knowledgeBaseId"].$get).toBeTypeOf(
      "function",
    );
    expect(apiClient.api["knowledge-bases"][":knowledgeBaseId"].$patch).toBeTypeOf(
      "function",
    );
    expect(
      apiClient.api["knowledge-bases"][":knowledgeBaseId"].documents.upload.$post,
    ).toBeTypeOf("function");
    expect(
      apiClient.api["knowledge-bases"][":knowledgeBaseId"].documents.processing.$get,
    ).toBeTypeOf("function");
    expect(
      apiClient.api["knowledge-bases"][":knowledgeBaseId"].documents[
        ":documentId"
      ].retry.$post,
    ).toBeTypeOf("function");
  });

  it("exports the document upload, list, and retry hooks", () => {
    expect(useUploadDocumentFile).toBeTypeOf("function");
    expect(useInfiniteDocumentProcessing).toBeTypeOf("function");
    expect(useRetryDocumentProcessing).toBeTypeOf("function");
  });

  it("detects active document processing for document-processing list polling", () => {
    expect(
      hasActiveDocumentProcessing(
        documentProcessingPage({
          documentStatus: "ready",
          jobStatus: "completed",
        }),
      ),
    ).toBe(false);
    expect(
      hasActiveDocumentProcessing(
        documentProcessingPage({
          documentStatus: "failed",
          jobStatus: "failed",
        }),
      ),
    ).toBe(false);
    expect(
      hasActiveDocumentProcessing(
        documentProcessingPage({
          documentStatus: "processing",
          jobStatus: "queued",
        }),
      ),
    ).toBe(true);
  });

  it("replaces a retried document in document-processing infinite cache data", () => {
    const staleDocument = documentProcessingSummary({
      canRetry: true,
      documentStatus: "failed",
      id: "doc_1",
      jobStatus: "failed",
      lastErrorMessage: "Document processing failed.",
      progress: {
        chunkCount: 7,
        embeddedCount: 2,
      },
    });
    const unchangedDocument = documentProcessingSummary({
      documentStatus: "ready",
      id: "doc_2",
      jobStatus: "completed",
    });
    const retryDocument = documentProcessingSummary({
      canRetry: false,
      documentStatus: "processing",
      id: "doc_1",
      jobStatus: "queued",
      lastErrorMessage: null,
      progress: {
        chunkCount: null,
        embeddedCount: null,
      },
    });
    const data: InfiniteData<DocumentProcessingPage> = {
      pageParams: [1, 2],
      pages: [
        {
          items: [staleDocument],
          page: 1,
          pageSize: 1,
          total: 2,
        },
        {
          items: [unchangedDocument],
          page: 2,
          pageSize: 1,
          total: 2,
        },
      ],
    };

    const updated = replaceDocumentProcessingDocument(data, retryDocument);

    expect(updated?.pages[0]?.items[0]).toEqual(retryDocument);
    expect(updated?.pages[1]).toBe(data.pages[1]);
    expect(updated?.pageParams).toBe(data.pageParams);
  });
});

function documentProcessingPage(input: {
  documentStatus: DocumentProcessingPage["items"][number]["status"];
  jobStatus: NonNullable<
    DocumentProcessingPage["items"][number]["job"]
  >["status"];
}): DocumentProcessingPage {
  return {
    items: [
      documentProcessingSummary({
        documentStatus: input.documentStatus,
        id: "doc_1",
        jobStatus: input.jobStatus,
      }),
    ],
    page: 1,
    pageSize: 8,
    total: 1,
  };
}

function documentProcessingSummary(input: {
  canRetry?: boolean;
  documentStatus: DocumentProcessingSummary["status"];
  id: string;
  jobStatus: NonNullable<DocumentProcessingSummary["job"]>["status"];
  lastErrorMessage?: string | null;
  progress?: DocumentProcessingSummary["progress"];
}): DocumentProcessingSummary {
  return {
    currentVersion: 1,
    id: input.id,
    job: {
      attempts: 1,
      canRetry: input.canRetry ?? false,
      currentStep: "source_connector",
      id: `job_${input.id}`,
      lastErrorCode:
        input.lastErrorMessage === undefined || input.lastErrorMessage === null
          ? null
          : "PROCESSING_FAILED",
      lastErrorMessage: input.lastErrorMessage ?? null,
      maxAttempts: 3,
      status: input.jobStatus,
      updatedAt: timestamp,
    },
    progress: input.progress ?? {
      chunkCount: null,
      embeddedCount: null,
    },
    source: {
      objectCleanupStatus: "not_required",
    },
    status: input.documentStatus,
    title: input.id,
    updatedAt: timestamp,
  };
}
