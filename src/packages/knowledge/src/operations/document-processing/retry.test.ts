import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("document processing retry operation", () => {
  it("fetches only the retried document summary after a retry attempt", () => {
    const source = readFileSync(new URL("./retry.ts", import.meta.url), "utf8");
    const summaryBlock = source.slice(
      source.indexOf("async function findDocumentProcessingSummary"),
    );

    expect(summaryBlock).toContain("documentId: input.documentId");
    expect(summaryBlock).toContain("pageSize: 1");
    expect(summaryBlock).not.toContain(".find((item)");
  });

  it("does not mark retry jobs queued when the queue producer is missing", () => {
    const source = readFileSync(new URL("./retry.ts", import.meta.url), "utf8");
    const canQueueBlock = source.slice(
      source.indexOf("if (!canQueueRetry(candidate))"),
      source.indexOf("const queued = await markDocumentProcessingRetryQueued"),
    );

    expect(canQueueBlock).toContain("options.ingestionQueueProducer === undefined");
    expect(canQueueBlock).toContain(
      "returnCurrentDocumentSummary(options, input, false)",
    );
  });

  it("scopes enqueue-failure recovery updates by ingestion job and tenant", () => {
    const source = readFileSync(new URL("./retry.ts", import.meta.url), "utf8");

    const enqueueFailureBlock = source.slice(
      source.indexOf("async function markRetryQueueEnqueueFailed"),
    );

    expect(enqueueFailureBlock).toContain("eq(ingestionJobs.id, input.ingestionJobId)");
    expect(enqueueFailureBlock).toContain("eq(ingestionJobs.tenantId, input.tenantId)");
    expect(enqueueFailureBlock).toContain(
      "eq(ingestionJobs.knowledgeBaseId, input.knowledgeBaseId)",
    );
    expect(enqueueFailureBlock).toContain(
      "eq(ingestionJobs.documentId, input.documentId)",
    );
    expect(enqueueFailureBlock).toContain('eq(ingestionJobs.status, "queued")');
    expect(enqueueFailureBlock).toContain("eq(ingestionJobs.queuedAt, input.queuedAt)");
  });

  it("scopes retry candidate joins to the requested knowledge base", () => {
    const source = readFileSync(new URL("./retry.ts", import.meta.url), "utf8");

    const candidateBlock = source.slice(
      source.indexOf("async function findLatestRetryCandidate"),
      source.indexOf("function canQueueRetry"),
    );

    expect(candidateBlock).toContain(
      "eq(ingestionJobs.knowledgeBaseId, documents.knowledgeBaseId)",
    );
    expect(candidateBlock).toContain(
      "eq(documentSources.knowledgeBaseId, ingestionJobs.knowledgeBaseId)",
    );
    expect(candidateBlock).toContain(
      "eq(ingestionJobs.knowledgeBaseId, input.knowledgeBaseId)",
    );
  });

  it("keeps document processing summary queries paginated and aggregates progress in SQL", () => {
    const source = readFileSync(
      new URL("../../service/queries.ts", import.meta.url),
      "utf8",
    );
    const listBlock = source.slice(
      source.indexOf(
        "export async function listKnowledgeBaseDocumentProcessingSummaries",
      ),
      source.indexOf("export async function listValidMemberIds"),
    );

    expect(listBlock).toContain(".limit(input.query.pageSize)");
    expect(listBlock).toContain(".offset(offset)");
    expect(listBlock).toContain("input.documentId !== undefined");
    expect(listBlock).toContain("queuedAt: ingestionJobs.queuedAt");
    expect(listBlock).toContain("value: count()");
    expect(listBlock).toContain(".groupBy(documentChunks.documentId)");
    expect(listBlock).toContain(".groupBy(chunkEmbeddings.documentId)");
    expect(listBlock).toContain("gte(documentChunks.createdAt, progressStartedAt)");
    expect(listBlock).toContain("gte(chunkEmbeddings.createdAt, progressStartedAt)");
    expect(listBlock).toContain(".groupBy(ingestionJobLogs.jobId)");
    expect(listBlock).toContain("gte(ingestionJobLogs.createdAt, job.queuedAt)");
    expect(listBlock).toContain(
      "normalizeOptionalDocumentProcessingCount(row.chunkCount)",
    );
    expect(listBlock).not.toContain("countRowsInCurrentProgressWindow");
    expect(listBlock).not.toContain("row.createdAt.getTime()");
  });

  it("does not fall back to another source when the latest job source is missing", () => {
    const source = readFileSync(
      new URL("../../service/queries.ts", import.meta.url),
      "utf8",
    );
    const sourceSelectionBlock = source.slice(
      source.indexOf("function selectDocumentProcessingSource"),
      source.indexOf("function sourceLookupKey"),
    );
    const jobSourceBlock = sourceSelectionBlock.slice(
      sourceSelectionBlock.indexOf("const source ="),
    );

    expect(sourceSelectionBlock).toContain(
      "sourceLookupKey(input.document.id, input.job.sourceHash)",
    );
    expect(sourceSelectionBlock).toContain("throw new Error");
    expect(jobSourceBlock).not.toContain("latestByDocumentId");
  });
});
