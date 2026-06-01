import { Pencil, Trash2 } from "lucide-react";
import type { ReactElement } from "react";

import type { UserSummary } from "@kb/users";

import { Button } from "@/components/ui/button";
import {
  adminRowActionClassName,
  adminRowClassName,
  adminRowMetaClassName,
  adminRowPrimaryActionClassName,
  adminRowSideClassName,
} from "@/features/admin/admin-list-layout";

export function UserRow({
  onConfirm,
  onEdit,
  onNotice,
  onRemoveAccess,
  onSelect,
  selfProtected,
  user,
}: {
  onConfirm: (callback: () => void) => void;
  onEdit: () => void;
  onNotice: (notice: string) => void;
  onRemoveAccess: () => Promise<void>;
  onSelect: () => void;
  selfProtected: boolean;
  user: UserSummary;
}): ReactElement {
  return (
    <div className={adminRowClassName()}>
      <button
        className={adminRowPrimaryActionClassName()}
        onClick={onSelect}
        type="button"
      >
        <p className="truncate text-sm font-semibold text-foreground">{user.name}</p>
        <p className="mt-1 text-xs text-muted-foreground">{user.email}</p>
      </button>
      <div className={adminRowSideClassName()}>
        <div className={adminRowMetaClassName()}>
          <span>{user.role}</span>
          <span>{user.updatedAt.slice(0, 10)}</span>
        </div>
        <div className={adminRowActionClassName()}>
          <Button onClick={onSelect}>查看</Button>
          <Button onClick={onEdit}>
            <Pencil aria-hidden="true" className="h-4 w-4" />
            编辑
          </Button>
          <Button
            disabled={selfProtected}
            disabledReason="不能移除当前登录管理员的访问权。"
            onClick={() =>
              onConfirm(() => {
                void onRemoveAccess().then(() => onNotice("用户访问权已移除。"));
              })
            }
            variant="danger"
          >
            <Trash2 aria-hidden="true" className="h-4 w-4" />
            删除
          </Button>
        </div>
      </div>
    </div>
  );
}
