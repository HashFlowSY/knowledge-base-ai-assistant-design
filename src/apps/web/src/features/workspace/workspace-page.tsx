"use client";

import { FileUp, Globe2, Pencil, Plus } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type ReactElement } from "react";
import { toast } from "sonner";

import { knowledgeBaseListQuerySchema } from "@kb/knowledge";

import { knowledgeCopy } from "../../copy/knowledge";
import { useSessionQuery } from "../auth/auth-hooks";
import {
  useInfiniteKnowledgeBases,
  useKnowledgeBase,
} from "../knowledge/knowledge-hooks";
import { ProtectedPage } from "../shell/protected-page";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/alert";
import { Panel, PanelHeader } from "@/components/ui/card";
import { KnowledgeBaseDialog } from "./knowledge-base-dialog";
import { KnowledgeBaseList } from "./knowledge-base-list";
import { KnowledgeBaseSummary } from "./knowledge-base-summary";
import { QueryErrorState } from "./query-error-state";
import { UploadDocumentDialog } from "./upload-document-dialog";
import { dedupeKnowledgeBases } from "./workspace-formatters";
import {
  workspaceContentClassName,
  workspacePageGridClassName,
} from "./workspace-layout";
import {
  normalizeSearchParam,
  updateQueryParam,
} from "./workspace-query-params";
import type { WorkspaceDialogState } from "./workspace-types";

const knowledgeBaseListPageSize = 8;

export function WorkspacePage(): ReactElement {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const sessionQuery = useSessionQuery();
  const [dialog, setDialog] = useState<WorkspaceDialogState>(null);
  const query = knowledgeBaseListQuerySchema.parse(Object.fromEntries(searchParams));
  const knowledgeBaseIdFromUrl = normalizeSearchParam(
    searchParams.get("knowledgeBaseId"),
  );
  const knowledgeBaseListQuery = useMemo(
    () => ({
      pageSize: knowledgeBaseListPageSize,
      sort: "updated" as const,
      ...(query.search === undefined ? {} : { search: query.search }),
    }),
    [query.search],
  );
  const knowledgeBasesQuery = useInfiniteKnowledgeBases(knowledgeBaseListQuery);
  const knowledgeBaseItems = useMemo(
    () =>
      dedupeKnowledgeBases(
        knowledgeBasesQuery.data?.pages.flatMap((page) => page.items) ?? [],
      ),
    [knowledgeBasesQuery.data?.pages],
  );
  const selectedKnowledgeBaseId =
    knowledgeBaseIdFromUrl ?? knowledgeBaseItems[0]?.id ?? null;
  const selectedKnowledgeBaseQuery = useKnowledgeBase(selectedKnowledgeBaseId);
  const isAdmin = sessionQuery.data?.role === "admin";

  useEffect(() => {
    if (knowledgeBaseIdFromUrl === null && knowledgeBaseItems[0] !== undefined) {
      updateQueryParam({
        key: "knowledgeBaseId",
        pathname,
        router,
        searchParams,
        value: knowledgeBaseItems[0].id,
      });
    }
  }, [knowledgeBaseIdFromUrl, knowledgeBaseItems, pathname, router, searchParams]);

  function updateParam(key: string, value: string): void {
    updateQueryParam({ key, pathname, router, searchParams, value });
  }

  function selectKnowledgeBase(knowledgeBaseId: string): void {
    updateParam("knowledgeBaseId", knowledgeBaseId);
  }

  function fetchNextKnowledgeBasePage(): void {
    if (
      knowledgeBasesQuery.hasNextPage === true &&
      !knowledgeBasesQuery.isFetchingNextPage
    ) {
      void knowledgeBasesQuery.fetchNextPage();
    }
  }

  function showSuccessNotice(message: string): void {
    toast.success(message);
  }

  return (
    <ProtectedPage>
      <div className={workspacePageGridClassName()}>
        <KnowledgeBaseList
          fetchNextPage={fetchNextKnowledgeBasePage}
          hasNextPage={knowledgeBasesQuery.hasNextPage === true}
          isError={knowledgeBasesQuery.isError}
          isFetchingNextPage={knowledgeBasesQuery.isFetchingNextPage}
          isInitialLoading={
            knowledgeBasesQuery.isLoading && knowledgeBasesQuery.data === undefined
          }
          items={knowledgeBaseItems}
          onRetry={() => knowledgeBasesQuery.refetch()}
          onSearchChange={(value) => updateParam("search", value)}
          onSelect={selectKnowledgeBase}
          search={query.search}
          selectedKnowledgeBaseId={selectedKnowledgeBaseId}
        />

        <section className={workspaceContentClassName()}>
          <Panel className="overflow-hidden">
            <PanelHeader
              action={
                <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
                  {isAdmin ? (
                    <Button
                      onClick={() => setDialog({ mode: "create" })}
                      variant="secondary"
                    >
                      <Plus aria-hidden="true" className="h-4 w-4" />
                      {knowledgeCopy.createKnowledgeBase}
                    </Button>
                  ) : null}
                  {isAdmin && selectedKnowledgeBaseId !== null ? (
                    <Button
                      onClick={() =>
                        setDialog({
                          knowledgeBaseId: selectedKnowledgeBaseId,
                          mode: "edit",
                        })
                      }
                    >
                      <Pencil aria-hidden="true" className="h-4 w-4" />
                      {knowledgeCopy.editKnowledgeBase}
                    </Button>
                  ) : null}
                  <Button
                    disabled={selectedKnowledgeBaseId === null}
                    disabledReason={knowledgeCopy.disabled.upload}
                    onClick={() => {
                      if (selectedKnowledgeBaseId !== null) {
                        setDialog({
                          knowledgeBaseId: selectedKnowledgeBaseId,
                          mode: "upload",
                        });
                      }
                    }}
                    variant="primary"
                  >
                    <FileUp aria-hidden="true" className="h-4 w-4" />
                    {knowledgeCopy.uploadFile}
                  </Button>
                  <Button
                    disabled={true}
                    disabledReason={knowledgeCopy.disabled.importPending}
                    variant="secondary"
                  >
                    <Globe2 aria-hidden="true" className="h-4 w-4" />
                    {knowledgeCopy.importUrl}
                  </Button>
                </div>
              }
              description={knowledgeCopy.workspaceDescription}
              title={knowledgeCopy.workspaceTitle}
            />
            {selectedKnowledgeBaseId === null ? (
              <div className="p-4">
                <Notice>{knowledgeCopy.empty.noKnowledgeBaseSelected}</Notice>
              </div>
            ) : selectedKnowledgeBaseQuery.isError ? (
              <QueryErrorState
                actionLabel={knowledgeCopy.retry}
                message={knowledgeCopy.errors.knowledgeBaseDetail}
                onRetry={() => selectedKnowledgeBaseQuery.refetch()}
              />
            ) : selectedKnowledgeBaseQuery.isLoading &&
              selectedKnowledgeBaseQuery.data === undefined ? (
              <div className="p-4">
                <Notice>{knowledgeCopy.pending.knowledgeBaseDetail}</Notice>
              </div>
            ) : selectedKnowledgeBaseQuery.data !== undefined ? (
              <KnowledgeBaseSummary
                knowledgeBase={selectedKnowledgeBaseQuery.data}
              />
            ) : (
              <div className="p-4">
                <Notice>{knowledgeCopy.empty.noKnowledgeBaseSelected}</Notice>
              </div>
            )}
          </Panel>
        </section>
      </div>

      {dialog === null ? null : dialog.mode === "upload" ? (
        <UploadDocumentDialog
          knowledgeBaseId={dialog.knowledgeBaseId}
          onClose={() => setDialog(null)}
          onNotice={showSuccessNotice}
        />
      ) : (
        <KnowledgeBaseDialog
          knowledgeBaseId={dialog.mode === "edit" ? dialog.knowledgeBaseId : null}
          mode={dialog.mode}
          onClose={() => setDialog(null)}
          onNotice={showSuccessNotice}
          onSelectKnowledgeBase={selectKnowledgeBase}
        />
      )}
    </ProtectedPage>
  );
}
