import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { DocumentProcessingSummary } from "@kb/knowledge";

import { knowledgeCopy } from "../../copy/knowledge";
import { getRetryDisabledReason } from "./document-processing-state";

const timestamp = "2026-06-05T08:00:00.000Z";

describe("document processing list display helpers", () => {
  it("does not describe completed jobs as active processing work", () => {
    expect(
      getRetryDisabledReason(
        documentSummary({
          documentStatus: "ready",
          jobStatus: "completed",
        }),
      ),
    ).toBe(knowledgeCopy.documentProcessing.completedDisabled);
  });

  it("describes only active job states as active processing work", () => {
    for (const jobStatus of ["pending_source", "queued", "running", "retrying"] as const) {
      expect(
        getRetryDisabledReason(
          documentSummary({
            documentStatus: "processing",
            jobStatus,
          }),
        ),
      ).toBe(knowledgeCopy.documentProcessing.activeDisabled);
    }
  });

  it("does not read raw cleanup error messages in the document list", () => {
    const source = readFileSync(
      new URL("./document-processing-list.tsx", import.meta.url),
      "utf8",
    );

    expect(source).not.toContain("objectCleanupErrorMessage");
    expect(source).toContain("knowledgeCopy.documentProcessing.cleanupFailed");
  });

  it("loads document processing rows with the shared infinite-scroll pattern", () => {
    const source = readFileSync(
      new URL("./document-processing-list.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain("useInfiniteDocumentProcessing");
    expect(source).toContain("ScrollArea");
    expect(source).toContain("fetchNextPage");
    expect(source).not.toContain("documents: DocumentProcessingSummary[]");
  });
});

function documentSummary(input: {
  documentStatus: DocumentProcessingSummary["status"];
  jobStatus: NonNullable<DocumentProcessingSummary["job"]>["status"];
}): DocumentProcessingSummary {
  return {
    currentVersion: 1,
    id: "doc_1",
    job: {
      attempts: 1,
      canRetry: false,
      currentStep: "index_writer",
      id: "job_1",
      lastErrorCode: null,
      lastErrorMessage: null,
      maxAttempts: 3,
      status: input.jobStatus,
      updatedAt: timestamp,
    },
    progress: {
      chunkCount: 12,
      embeddedCount: 12,
    },
    source: {
      objectCleanupStatus: "not_required",
    },
    status: input.documentStatus,
    title: "反脆弱",
    updatedAt: timestamp,
  };
}
