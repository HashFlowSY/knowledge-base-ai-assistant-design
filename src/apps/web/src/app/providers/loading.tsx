import type { ReactElement } from "react";

import { AppShellSkeleton } from "../../features/ui/skeleton";

export default function ProvidersLoading(): ReactElement {
  return <AppShellSkeleton variant="table" />;
}
