import type { ReactElement, ReactNode } from "react";

import { AppShell } from "./app-shell";

export function ProtectedPage({ children }: { children: ReactNode }): ReactElement {
  return <AppShell>{children}</AppShell>;
}
