import type { ReactElement } from "react";

import { Panel, PanelHeader } from "../ui/panel";
import { ScrollArea } from "../ui/scroll-area";
import { workspaceSummaryListClassName } from "./workspace-layout";
import { WorkspaceSummaryEmptyState } from "./workspace-summary-empty-state";

export function WorkspaceSummaryPanel({
  action,
  message,
  title,
}: {
  action?: ReactElement | null;
  message: string;
  title: string;
}): ReactElement {
  return (
    <Panel>
      <PanelHeader action={action ?? undefined} title={title} />
      <ScrollArea
        aria-label={title}
        className={workspaceSummaryListClassName()}
        size="lg"
      >
        <WorkspaceSummaryEmptyState message={message} />
      </ScrollArea>
    </Panel>
  );
}
