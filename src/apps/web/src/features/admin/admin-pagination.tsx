import type { ReactElement } from "react";

import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select";
import { toSelectOptions } from "./select-options";

export function AdminPagination({
  currentPage,
  pageSize,
  total,
  totalPages,
  updateParam,
}: {
  currentPage: number;
  pageSize: number;
  total: number;
  totalPages: number;
  updateParam: (key: string, value: string) => void;
}): ReactElement {
  return (
    <div className="flex flex-col gap-3 border-t border-border p-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted-foreground">
        共 {total} 条 · 第 {currentPage}/{totalPages} 页
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          每页
          <SelectField
            ariaLabel="每页条数"
            className="w-20"
            onChange={(value) => updateParam("pageSize", value)}
            options={toSelectOptions([["5", "5"], ["8", "8"], ["12", "12"]])}
            value={pageSize.toString()}
          />
        </div>
        <Button
          disabled={currentPage <= 1}
          disabledReason="已经是第一页。"
          onClick={() => updateParam("page", (currentPage - 1).toString())}
        >
          上一页
        </Button>
        <Button
          disabled={currentPage >= totalPages}
          disabledReason="已经是最后一页。"
          onClick={() => updateParam("page", (currentPage + 1).toString())}
        >
          下一页
        </Button>
      </div>
    </div>
  );
}
