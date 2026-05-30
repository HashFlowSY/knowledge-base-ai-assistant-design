import type { ReactElement } from "react";

import type { UserSummary } from "@kb/users";

import { Drawer } from "../ui/drawer";
import { Notice } from "../ui/notice";
import { Panel, PanelHeader } from "../ui/panel";

export function UserDetailDrawer({
  onClose,
  selectedUser,
}: {
  onClose: () => void;
  selectedUser: UserSummary | null;
}): ReactElement {
  if (selectedUser === null) {
    return (
      <Panel>
        <PanelHeader title="详情" />
        <div className="p-4">
          <Notice>选择一行后查看用户详情。</Notice>
        </div>
      </Panel>
    );
  }

  return (
    <Drawer onClose={onClose} title="详情">
      <div className="space-y-3">
        <Info label="用户" value={selectedUser.name} />
        <Info label="邮箱" value={selectedUser.email} />
        <Info label="角色" value={selectedUser.role} />
        <Info label="创建时间" value={selectedUser.createdAt} />
        <Info label="更新时间" value={selectedUser.updatedAt} />
      </div>
    </Drawer>
  );
}

function Info({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm text-slate-800">{value}</p>
    </div>
  );
}
