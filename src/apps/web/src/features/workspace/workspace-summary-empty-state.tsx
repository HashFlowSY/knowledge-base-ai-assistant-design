import type { ReactElement } from "react";

import { Notice } from "../ui/notice";
import { workspaceSummaryEmptyClassName } from "./workspace-layout";

export function WorkspaceSummaryEmptyState({
  message,
}: {
  message: string;
}): ReactElement {
  return (
    <div className={workspaceSummaryEmptyClassName()}>
      <Notice>{message}</Notice>
    </div>
  );
}
