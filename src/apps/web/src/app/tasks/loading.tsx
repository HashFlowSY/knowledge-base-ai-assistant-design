import type { ReactElement } from "react";

import { AppShellSkeleton } from "../../features/ui/skeleton";

export default function TasksLoading(): ReactElement {
  return <AppShellSkeleton variant="table" />;
}
