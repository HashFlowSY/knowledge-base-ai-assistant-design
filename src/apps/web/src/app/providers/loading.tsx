import type { ReactElement } from "react";

import { AppShellSkeleton } from "@/components/ui/skeleton";

export default function ProvidersLoading(): ReactElement {
  return <AppShellSkeleton variant="table" />;
}
