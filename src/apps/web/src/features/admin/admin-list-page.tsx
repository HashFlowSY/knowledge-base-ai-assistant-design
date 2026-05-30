import type { ReactElement } from "react";

import { adminCopy } from "../../copy/admin";
import { Notice } from "../ui/notice";
import { Panel, PanelHeader } from "../ui/panel";
import { ProtectedPage } from "../shell/protected-page";
import { ProvidersPage } from "./providers-page";
import { UsersPage } from "./users-page";

export type AdminPageKind = "tasks" | "logs" | "providers" | "users" | "audit";

export function AdminListPage({ kind }: { kind: AdminPageKind }): ReactElement {
  if (kind === "providers") {
    return <ProvidersPage />;
  }

  if (kind !== "users") {
    return (
      <ProtectedPage>
        <Panel>
          <PanelHeader description={adminCopy[kind].description} title={adminCopy[kind].title} />
          <div className="p-4">
            <Notice>该页面已移除前端 mock 数据，等待后续真实 API 接入。</Notice>
          </div>
        </Panel>
      </ProtectedPage>
    );
  }

  return <UsersPage />;
}
