import { Search } from "lucide-react";
import type { ReactElement, UIEvent } from "react";

import type { KnowledgeBaseSummary } from "@kb/knowledge";

import { knowledgeCopy } from "../../copy/knowledge";
import { Notice } from "../ui/notice";
import { Panel, PanelHeader } from "../ui/panel";
import { ScrollArea } from "../ui/scroll-area";
import { KnowledgeBaseListItem } from "./knowledge-base-list-item";
import { QueryErrorState } from "./query-error-state";
import {
  workspaceKnowledgeListClassName,
  workspaceKnowledgePanelClassName,
} from "./workspace-layout";

export function KnowledgeBaseList({
  fetchNextPage,
  hasNextPage,
  isError,
  isFetchingNextPage,
  isInitialLoading,
  items,
  notice,
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
  notice: string | null;
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
      <div className="border-b border-slate-200 p-4">
        <label className="flex min-h-11 items-center gap-2 rounded-md border border-slate-200 bg-white px-3">
          <Search aria-hidden="true" className="h-4 w-4 text-slate-400" />
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
      {notice === null ? null : (
        <div className="border-b border-slate-200 p-4">
          <Notice tone="success">{notice}</Notice>
        </div>
      )}
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
          <div className="divide-y divide-slate-200">
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
            <p className="px-4 py-3 text-xs text-slate-500">
              {knowledgeCopy.listScrollHint}
            </p>
          ) : null}
        </ScrollArea>
      )}
    </Panel>
  );
}
