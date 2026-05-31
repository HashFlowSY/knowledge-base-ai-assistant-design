import type { ReactElement } from "react";

import type { KnowledgeBaseSummary } from "@kb/knowledge";

import { knowledgeCopy } from "../../copy/knowledge";
import { listActionButtonClassName } from "@/lib/action-styles";
import { formatMemberSummary } from "./workspace-formatters";

export function KnowledgeBaseListItem({
  active,
  item,
  onSelect,
}: {
  active: boolean;
  item: KnowledgeBaseSummary;
  onSelect: () => void;
}): ReactElement {
  return (
    <button
      aria-pressed={active}
      className={listActionButtonClassName(active)}
      onClick={onSelect}
      type="button"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{item.name}</p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
            {item.description ?? knowledgeCopy.labels.noDescription}
          </p>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {knowledgeCopy.labels.documentCountValue(item.documentCount)} ·{" "}
        {knowledgeCopy.labels.memberCountValue(item.memberCount)}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {formatMemberSummary(item.members, item.memberCount)}
      </p>
    </button>
  );
}
