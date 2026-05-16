import type { ReactElement } from "react";

import { AppShellSkeleton } from "../../../features/ui/skeleton";

export default function DocumentDetailLoading(): ReactElement {
  return <AppShellSkeleton variant="document" />;
}
