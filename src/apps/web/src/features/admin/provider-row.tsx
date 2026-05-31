import { Pencil } from "lucide-react";
import type { ReactElement } from "react";

import type { ProviderSummary } from "@kb/ai-providers";

import { Button } from "@/components/ui/button";
import { adminRowPrimaryActionClassName } from "./admin-list-layout";
import { providerGridClassName } from "./provider-grid";
import { providerRowView } from "./provider-page-view";

export function ProviderRow({
  onEdit,
  provider,
}: {
  onEdit: () => void;
  provider: ProviderSummary;
}): ReactElement {
  const view = providerRowView(provider);

  return (
    <div className={`${providerGridClassName()} items-center px-4 py-3 text-sm`}>
      <button className={adminRowPrimaryActionClassName()} onClick={onEdit} type="button">
        <p className="truncate text-sm font-semibold text-foreground">
          {view.title}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{view.subtitle}</p>
      </button>
      <ProviderCell value={view.providerName} />
      <ProviderCell value={view.modelId} />
      <ProviderCell value={view.baseUrl} />
      <ProviderCell value={view.updatedAt} />
      <div className="flex justify-end">
        <Button onClick={onEdit}>
          <Pencil aria-hidden="true" className="h-4 w-4" />
          {view.actionLabel}
        </Button>
      </div>
    </div>
  );
}

function ProviderCell({ value }: { value: string }): ReactElement {
  return (
    <span className="min-w-0 truncate text-muted-foreground" title={value}>
      {value}
    </span>
  );
}
