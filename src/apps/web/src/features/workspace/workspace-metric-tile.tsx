import type { ReactElement } from "react";

import { workspaceMetricTileClassName } from "./workspace-layout";

export function WorkspaceMetricTile({
  label,
  value,
}: {
  label: string;
  value: string;
}): ReactElement {
  return (
    <div className={workspaceMetricTileClassName()}>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-950">{value}</p>
    </div>
  );
}
