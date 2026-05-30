import type { ReactElement } from "react";

import { adminCopy } from "../../copy/admin";
import { Notice } from "../ui/notice";
import { Panel, PanelHeader } from "../ui/panel";
import { ProtectedPage } from "../shell/protected-page";
import { ProvidersPage } from "./providers-page";
import { UsersPage } from "./users-page";

export type AdminPageKind = "providers" | "users" | "audit";

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
            <Notice>{adminCopy[kind].empty}</Notice>
          </div>
        </Panel>
      </ProtectedPage>
    );
  }

  return <UsersPage />;
}
