import type { ReactElement } from "react";

import { AppShellSkeleton } from "../../features/ui/skeleton";

export default function LogsLoading(): ReactElement {
  return <AppShellSkeleton variant="table" />;
}
