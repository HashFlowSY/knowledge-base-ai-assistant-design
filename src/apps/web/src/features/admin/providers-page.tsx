"use client";

import { useState, type ReactElement } from "react";
import { toast } from "sonner";

import type { ProviderSummary } from "@kb/ai-providers";

import { adminCopy } from "../../copy/admin";
import { Notice } from "@/components/ui/alert";
import { Panel, PanelHeader } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ProtectedPage } from "../shell/protected-page";
import {
  adminListPanelClassName,
  adminListScrollClassName,
} from "./admin-list-layout";
import { AdminEmptyState } from "./admin-empty-state";
import { ProviderConfigDialog } from "./provider-config-dialog";
import { useProviders, useSaveProviderConfig } from "./provider-hooks";
import { providerGridClassName } from "./provider-grid";
import { providerListColumnLabels } from "./provider-page-view";
import { ProviderRow } from "./provider-row";

export function ProvidersPage(): ReactElement {
  const [providerDialog, setProviderDialog] = useState<ProviderSummary | null>(null);
  const providersQuery = useProviders();
  const saveProvider = useSaveProviderConfig();
  const providers = providersQuery.data ?? [];

  function showSuccessNotice(message: string): void {
    toast.success(message);
  }

  return (
    <ProtectedPage>
      <Panel className={adminListPanelClassName()}>
        <PanelHeader
          description={adminCopy.providers.description}
          title={adminCopy.providers.title}
        />
        {providersQuery.isError ? (
          <div className="p-4">
            <Notice tone="error">{adminCopy.providers.error}</Notice>
          </div>
        ) : providersQuery.isLoading ? (
          <div className="p-4">
            <Notice>正在加载模型服务配置。</Notice>
          </div>
        ) : providers.length === 0 ? (
          <AdminEmptyState message={adminCopy.providers.empty} />
        ) : (
          <ScrollArea aria-label="模型服务列表" className={adminListScrollClassName()} size="fill">
            <div className="overflow-x-auto">
              <div className="min-w-[920px]">
                <div
                  className={`${providerGridClassName()} border-b border-border bg-muted px-4 py-2 text-xs font-medium text-muted-foreground`}
                >
                  {providerListColumnLabels.map((label) => (
                    <span key={label}>{label}</span>
                  ))}
                </div>
                <div className="divide-y divide-border">
                  {providers.map((provider) => (
                    <ProviderRow
                      key={provider.kind}
                      onEdit={() => setProviderDialog(provider)}
                      provider={provider}
                    />
                  ))}
                </div>
              </div>
            </div>
          </ScrollArea>
        )}
      </Panel>

      {providerDialog === null ? null : (
        <ProviderConfigDialog
          isSaving={saveProvider.isPending}
          kind={providerDialog.kind}
          onClose={() => setProviderDialog(null)}
          onNotice={showSuccessNotice}
          onSave={async (input) => {
            await saveProvider.mutateAsync({
              ...input,
              kind: providerDialog.kind,
            });
          }}
          provider={providerDialog}
        />
      )}
    </ProtectedPage>
  );
}
