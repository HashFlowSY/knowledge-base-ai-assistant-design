import type { ReactElement } from "react";

import { AppShellSkeleton } from "@/components/ui/skeleton";

export default function ChatLoading(): ReactElement {
  return <AppShellSkeleton variant="chat" />;
}
