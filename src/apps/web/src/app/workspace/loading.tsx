import type { ReactElement } from "react";

import { AppShellSkeleton } from "../../features/ui/skeleton";

export default function WorkspaceLoading(): ReactElement {
  return <AppShellSkeleton variant="workspace" />;
}
