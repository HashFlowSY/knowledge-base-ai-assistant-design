import type { ReactElement } from "react";

import { AppShellSkeleton } from "@/components/ui/skeleton";

export default function UsersLoading(): ReactElement {
  return <AppShellSkeleton variant="table" />;
}
