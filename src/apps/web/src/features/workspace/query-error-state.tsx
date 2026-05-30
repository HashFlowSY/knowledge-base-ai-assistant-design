import type { ReactElement } from "react";

import { Button } from "../ui/button";
import { Notice } from "../ui/notice";

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
