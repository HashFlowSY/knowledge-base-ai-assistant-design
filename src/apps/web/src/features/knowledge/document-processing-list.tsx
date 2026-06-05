"use client";

import type { ReactElement, UIEvent } from "react";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";

import type { DocumentProcessingSummary } from "@kb/knowledge";

import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/badge";
import { Notice } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { knowledgeCopy } from "../../copy/knowledge";
import {
  useInfiniteDocumentProcessing,
  useRetryDocumentProcessing,
} from "../hooks/knowledge/knowledge-hooks";
import { QueryErrorState } from "../workspace/query-error-state";
import { getRetryDisabledReason } from "./document-processing-state";

export function DocumentProcessingList({
  knowledgeBaseId,
}: {
  knowledgeBaseId: string;
}): ReactElement {
  const documentProcessing = useInfiniteDocumentProcessing(knowledgeBaseId);
  const retryDocumentProcessing = useRetryDocumentProcessing();
  const documents =
    documentProcessing.data?.pages.flatMap((page) => page.items) ?? [];

  function handleDocumentProcessingScroll(event: UIEvent<HTMLDivElement>): void {
    const { clientHeight, scrollHeight, scrollTop } = event.currentTarget;
    const distanceToBottom = scrollHeight - scrollTop - clientHeight;

    if (
      distanceToBottom <= 96 &&
      documentProcessing.hasNextPage &&
      !documentProcessing.isFetchingNextPage
    ) {
      void documentProcessing.fetchNextPage();
    }
  }

  return (
    <section className="mt-5 border-t border-border pt-4">
      <h3 className="text-sm font-semibold text-foreground">
        {knowledgeCopy.documentProcessing.title}
      </h3>
      {documentProcessing.isError ? (
        <QueryErrorState
          actionLabel={knowledgeCopy.retry}
          message={knowledgeCopy.errors.documentProcessing}
          onRetry={documentProcessing.refetch}
        />
      ) : documentProcessing.isLoading && documentProcessing.data === undefined ? (
        <div className="mt-3">
          <Notice>{knowledgeCopy.pending.documentProcessing}</Notice>
        </div>
      ) : documents.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          {knowledgeCopy.documentProcessing.empty}
        </p>
      ) : (
        <ScrollArea
          aria-label={knowledgeCopy.documentProcessing.title}
          className="mt-3 rounded-lg border border-border"
          onScroll={handleDocumentProcessingScroll}
          size="sm"
        >
          <ul className="divide-y divide-border">
            {documents.map((document) => {
              const disabledReason = getRetryDisabledReason(document);
              const isRetrying =
                retryDocumentProcessing.isPending &&
                retryDocumentProcessing.variables?.documentId === document.id;

              return (
                <li
                  className="grid gap-3 px-3 py-3 md:grid-cols-[minmax(0,1fr)_auto]"
                  key={document.id}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium text-foreground">
                        {document.title}
                      </p>
                      <StatusPill tone={getStatusTone(document)}>
                        {getStatusLabel(document)}
                      </StatusPill>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>{formatChunkProgress(document.progress)}</span>
                      <span>{formatEmbeddingProgress(document.progress)}</span>
                      {document.job === null ? null : (
                        <span>
                          {document.job.attempts} / {document.job.maxAttempts}
                        </span>
                      )}
                    </div>
                    {document.job?.lastErrorMessage === null ||
                    document.job?.lastErrorMessage === undefined ? null : (
                      <p className="mt-2 text-xs text-destructive">
                        {document.job.lastErrorMessage}
                      </p>
                    )}
                    {document.source?.objectCleanupStatus === "cleanup_failed" ? (
                      <p className="mt-2 text-xs text-destructive">
                        {knowledgeCopy.documentProcessing.cleanupFailed}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center md:justify-end">
                    {document.job !== null && document.job.canRetry ? (
                      <Button
                        aria-label={`${knowledgeCopy.documentProcessing.retry} ${document.title}`}
                        disabled={isRetrying}
                        {...(isRetrying
                          ? {
                              disabledReason:
                                knowledgeCopy.documentProcessing.retrying,
                            }
                          : {})}
                        onClick={() => {
                          retryDocumentProcessing.mutate(
                            {
                              documentId: document.id,
                              knowledgeBaseId,
                            },
                            {
                              onError: () => {
                                toast.error(
                                  knowledgeCopy.documentProcessing.retryError,
                                );
                              },
                              onSuccess: (result) => {
                                if (result.queued) {
                                  toast.success(
                                    knowledgeCopy.documentProcessing.retrySuccess(
                                      document.title,
                                    ),
                                  );
                                  return;
                                }

                                toast(
                                  knowledgeCopy.documentProcessing.retryUnchanged,
                                );
                              },
                            },
                          );
                        }}
                        size="sm"
                        variant="outline"
                      >
                        <RotateCcw aria-hidden="true" />
                        {isRetrying
                          ? knowledgeCopy.documentProcessing.retrying
                          : knowledgeCopy.documentProcessing.retry}
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {disabledReason}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          {documentProcessing.isFetchingNextPage ? (
            <div className="p-3">
              <Notice>{knowledgeCopy.pending.moreDocumentProcessing}</Notice>
            </div>
          ) : documentProcessing.hasNextPage ? (
            <p className="px-3 py-3 text-xs text-muted-foreground">
              {knowledgeCopy.documentProcessing.scrollHint}
            </p>
          ) : null}
        </ScrollArea>
      )}
    </section>
  );
}

function formatChunkProgress(
  progress: DocumentProcessingSummary["progress"],
): string {
  return progress.chunkCount === null
    ? knowledgeCopy.documentProcessing.progress.chunkingUnknown
    : knowledgeCopy.documentProcessing.progress.chunked(progress.chunkCount);
}

function formatEmbeddingProgress(
  progress: DocumentProcessingSummary["progress"],
): string {
  if (progress.embeddedCount === null) {
    return knowledgeCopy.documentProcessing.progress.embeddingPending;
  }

  if (progress.chunkCount === null) {
    return knowledgeCopy.documentProcessing.progress.embeddedUnknown(
      progress.embeddedCount,
    );
  }

  return knowledgeCopy.documentProcessing.progress.embedded(
    progress.embeddedCount,
    progress.chunkCount,
  );
}

function getStatusLabel(document: DocumentProcessingSummary): string {
  const status = document.job?.status ?? document.status;
  return knowledgeCopy.documentProcessing.status[status];
}

function getStatusTone(
  document: DocumentProcessingSummary,
): "blue" | "red" | "slate" | "teal" | "yellow" {
  const status = document.job?.status ?? document.status;
  if (status === "failed" || status === "cancelled") {
    return "red";
  }

  if (status === "completed" || status === "ready") {
    return "teal";
  }

  if (
    status === "queued" ||
    status === "pending" ||
    status === "pending_source"
  ) {
    return "yellow";
  }

  if (status === "running" || status === "retrying" || status === "processing") {
    return "blue";
  }

  return "slate";
}
