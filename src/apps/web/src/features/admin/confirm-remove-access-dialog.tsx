import type { ReactElement } from "react";

import { Button } from "../ui/button";

export function ConfirmRemoveAccessDialog({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}): ReactElement {
  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
      role="dialog"
    >
      <section className="w-full max-w-md rounded-md border border-slate-200 bg-white p-4 shadow-xl">
        <h2 className="text-lg font-semibold text-slate-950">确认操作</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          该操作会移除用户默认租户访问权，是否继续？
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={onCancel}>取消</Button>
          <Button onClick={onConfirm} variant="primary">
            确认
          </Button>
        </div>
      </section>
    </div>
  );
}
