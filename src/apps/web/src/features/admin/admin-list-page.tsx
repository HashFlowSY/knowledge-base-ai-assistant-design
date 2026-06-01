import type { ReactElement } from "react";

import { adminCopy } from "../../copy/admin";
import { Notice } from "@/components/ui/alert";
import { Panel, PanelHeader } from "@/components/ui/card";
import { ProtectedPage } from "../shell/protected-page";
import { ProvidersPage } from "../provider/providers-page";
import { UsersPage } from "@/features/user/users-page";

export type AdminPageKind = "providers" | "users" | "audit";

export function AdminListPage({ kind }: { kind: AdminPageKind }): ReactElement {
  if (kind === "providers") {
    return <ProvidersPage />;
  }

  if (kind !== "users") {
    return (
      <ProtectedPage>
        <Panel>
          <PanelHeader
            description={adminCopy[kind].description}
            title={adminCopy[kind].title}
          />
          <div className="p-4">
            <Notice>{adminCopy[kind].empty}</Notice>
          </div>
        </Panel>
      </ProtectedPage>
    );
  }

  return <UsersPage />;
}
