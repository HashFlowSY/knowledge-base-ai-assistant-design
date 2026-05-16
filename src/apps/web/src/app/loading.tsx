import type { ReactElement } from "react";

import { AppShellSkeleton } from "../features/ui/skeleton";

export default function Loading(): ReactElement {
  return <AppShellSkeleton variant="workspace" />;
}
