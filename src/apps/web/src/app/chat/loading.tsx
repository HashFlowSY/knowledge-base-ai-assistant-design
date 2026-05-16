import type { ReactElement } from "react";

import { AppShellSkeleton } from "../../features/ui/skeleton";

export default function ChatLoading(): ReactElement {
  return <AppShellSkeleton variant="chat" />;
}
