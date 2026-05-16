import type { ReactElement } from "react";

import { AppShellSkeleton } from "../../features/ui/skeleton";

export default function UsersLoading(): ReactElement {
  return <AppShellSkeleton variant="table" />;
}
