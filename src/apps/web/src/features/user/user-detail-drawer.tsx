import type { ReactElement } from "react";

import type { UserSummary } from "@kb/users";

import { Drawer } from "@/components/ui/sheet";

export function UserDetailDrawer({
  onClose,
  selectedUser,
}: {
  onClose: () => void;
  selectedUser: UserSummary | null;
}): ReactElement | null {
  if (selectedUser === null) {
    return null;
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
    <div className="rounded-3xl border border-border bg-muted p-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 break-words text-sm text-foreground">{value}</p>
    </div>
  );
}
