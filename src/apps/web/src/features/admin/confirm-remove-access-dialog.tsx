import type { ReactElement } from "react";

import { Button } from "@/components/ui/button";
import { DialogFrame } from "@/components/ui/dialog";

export function ConfirmRemoveAccessDialog({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}): ReactElement {
  return (
    <DialogFrame onClose={onCancel} title="确认操作">
      <p className="text-sm leading-6 text-muted-foreground">
        该操作会移除用户默认租户访问权，是否继续？
      </p>
      <div className="flex justify-end gap-2">
        <Button onClick={onCancel}>取消</Button>
        <Button onClick={onConfirm} variant="primary">
          确认
        </Button>
      </div>
    </DialogFrame>
  );
}
