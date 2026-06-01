import { Search } from "lucide-react";
import type { ReactElement, UIEvent } from "react";

import type { KnowledgeBaseSummary } from "@kb/knowledge";

import { knowledgeCopy } from "../../copy/knowledge";
import { Notice } from "@/components/ui/alert";
import { Panel, PanelHeader } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { KnowledgeBaseListItem } from "./knowledge-base-list-item";
import { QueryErrorState } from "../workspace/query-error-state";
import {
  workspaceKnowledgeListClassName,
  workspaceKnowledgePanelClassName,
} from "../workspace/workspace-layout";

export function KnowledgeBaseList({
  fetchNextPage,
  hasNextPage,
  isError,
  isFetchingNextPage,
  isInitialLoading,
  items,
  onRetry,
  onSearchChange,
  onSelect,
  search,
  selectedKnowledgeBaseId,
}: {
  fetchNextPage: () => void;
  hasNextPage: boolean;
  isError: boolean;
  isFetchingNextPage: boolean;
  isInitialLoading: boolean;
  items: KnowledgeBaseSummary[];
  onRetry: () => Promise<unknown>;
  onSearchChange: (value: string) => void;
  onSelect: (knowledgeBaseId: string) => void;
  search: string | undefined;
  selectedKnowledgeBaseId: string | null;
}): ReactElement {
  function handleKnowledgeBaseListScroll(event: UIEvent<HTMLDivElement>): void {
    const { clientHeight, scrollHeight, scrollTop } = event.currentTarget;
    const distanceToBottom = scrollHeight - scrollTop - clientHeight;

    if (distanceToBottom <= 96) {
      fetchNextPage();
    }
  }

  return (
    <Panel className={workspaceKnowledgePanelClassName()}>
      <PanelHeader
        description={knowledgeCopy.listDescription}
        title={knowledgeCopy.listTitle}
      />
      <div className="border-b border-border p-4">
        <label className="flex min-h-11 items-center gap-2 rounded-3xl border border-border bg-input/50 px-3">
          <Search aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
          <span className="sr-only">{knowledgeCopy.searchLabel}</span>
          <input
            aria-label={knowledgeCopy.searchLabel}
            className="min-w-0 flex-1 text-sm outline-none"
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={knowledgeCopy.searchPlaceholder}
            value={search ?? ""}
          />
        </label>
      </div>
      {isError ? (
        <QueryErrorState
          actionLabel={knowledgeCopy.retry}
          message={knowledgeCopy.errors.knowledgeBaseList}
          onRetry={onRetry}
        />
      ) : isInitialLoading ? (
        <div className="p-4">
          <Notice>{knowledgeCopy.pending.knowledgeBaseList}</Notice>
        </div>
      ) : items.length === 0 ? (
        <div className="p-4">
          <Notice>
            {search === undefined
              ? knowledgeCopy.empty.knowledgeBaseList
              : knowledgeCopy.empty.searchResult}
          </Notice>
        </div>
      ) : (
        <ScrollArea
          aria-label={knowledgeCopy.listTitle}
          className={workspaceKnowledgeListClassName()}
          onScroll={handleKnowledgeBaseListScroll}
          size="fill"
        >
          <div className="divide-y divide-border">
            {items.map((item) => (
              <KnowledgeBaseListItem
                active={item.id === selectedKnowledgeBaseId}
                item={item}
                key={item.id}
                onSelect={() => onSelect(item.id)}
              />
            ))}
          </div>
          {isFetchingNextPage ? (
            <div className="p-4">
              <Notice>{knowledgeCopy.pending.moreKnowledgeBases}</Notice>
            </div>
          ) : hasNextPage ? (
            <p className="px-4 py-3 text-xs text-muted-foreground">
              {knowledgeCopy.listScrollHint}
            </p>
          ) : null}
        </ScrollArea>
      )}
    </Panel>
  );
}
