"use client";

import { useState, type ReactElement } from "react";

import type { ProviderSummary } from "@kb/ai-providers";

import { adminCopy } from "../../copy/admin";
import { Notice } from "../ui/notice";
import { Panel, PanelHeader } from "../ui/panel";
import { ScrollArea } from "../ui/scroll-area";
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
  const [notice, setNotice] = useState<string | null>(null);
  const [providerDialog, setProviderDialog] = useState<ProviderSummary | null>(null);
  const providersQuery = useProviders();
  const saveProvider = useSaveProviderConfig();
  const providers = providersQuery.data ?? [];

  return (
    <ProtectedPage>
      <Panel className={adminListPanelClassName()}>
        <PanelHeader
          description={adminCopy.providers.description}
          title={adminCopy.providers.title}
        />
        {notice === null ? null : (
          <div className="p-4">
            <Notice tone="success">{notice}</Notice>
          </div>
        )}
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
                  className={`${providerGridClassName()} border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-medium text-slate-500`}
                >
                  {providerListColumnLabels.map((label) => (
                    <span key={label}>{label}</span>
                  ))}
                </div>
                <div className="divide-y divide-slate-200">
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
          onNotice={setNotice}
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
