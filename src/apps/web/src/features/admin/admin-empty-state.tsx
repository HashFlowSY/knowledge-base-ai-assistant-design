import type { ReactElement } from "react";

import { Notice } from "../ui/notice";

export function AdminEmptyState({ message }: { message: string }): ReactElement {
  return (
    <div className="p-4">
      <Notice>{message}</Notice>
    </div>
  );
}
