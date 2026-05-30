import type { ReactElement } from "react";

import type { KnowledgeBaseDetail } from "@kb/knowledge";

import { knowledgeCopy } from "../../copy/knowledge";
import { ButtonLink } from "../ui/button";
import {
  formatMemberSummary,
  formatTimestamp,
} from "./workspace-formatters";
import { workspaceMetricGridClassName } from "./workspace-layout";
import { WorkspaceMetricTile } from "./workspace-metric-tile";

export function KnowledgeBaseSummary({
  knowledgeBase,
}: {
  knowledgeBase: KnowledgeBaseDetail;
}): ReactElement {
  return (
    <div className="p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold text-slate-950">
            {knowledgeBase.name}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            {knowledgeBase.description ?? knowledgeCopy.labels.noDescription}
          </p>
        </div>
        <div className="shrink-0">
          <ButtonLink href="/chat" variant="primary">
            {knowledgeCopy.openChat}
          </ButtonLink>
        </div>
      </div>
      <div className={workspaceMetricGridClassName()}>
        <WorkspaceMetricTile
          label={knowledgeCopy.labels.documentCount}
          value={knowledgeBase.documentCount.toString()}
        />
        <WorkspaceMetricTile
          label={knowledgeCopy.labels.memberCount}
          value={knowledgeBase.memberCount.toString()}
        />
        <WorkspaceMetricTile
          label={knowledgeCopy.labels.createdAt}
          value={formatTimestamp(knowledgeBase.createdAt)}
        />
      </div>
      <div className="mt-4 space-y-2">
        <p className="text-xs font-medium text-slate-500">
          {knowledgeCopy.members.searchLabel}
        </p>
        <p className="text-sm text-slate-600">
          {formatMemberSummary(knowledgeBase.members, knowledgeBase.memberCount)}
        </p>
        {knowledgeBase.members.length === 0 ? null : (
          <ul className="space-y-2">
            {knowledgeBase.members.map((member) => (
              <li
                className="rounded-md border border-slate-200 px-3 py-2"
                key={member.id}
              >
                <p className="text-sm font-medium text-slate-950">{member.name}</p>
                <p className="mt-1 text-xs text-slate-500">{member.email}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
