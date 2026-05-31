import type { ReactElement } from "react";

import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/alert";

export function QueryErrorState({
  actionLabel,
  message,
  onRetry,
}: {
  actionLabel: string;
  message: string;
  onRetry: () => Promise<unknown>;
}): ReactElement {
  return (
    <div className="space-y-3 p-4">
      <Notice tone="error">{message}</Notice>
      <Button onClick={() => void onRetry()}>{actionLabel}</Button>
    </div>
  );
}
