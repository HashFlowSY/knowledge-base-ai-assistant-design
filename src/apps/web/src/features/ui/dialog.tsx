import type { FormEvent, ReactElement, ReactNode } from "react";
import { X } from "lucide-react";

import { Button } from "./button";

export function DialogFrame({
  children,
  description,
  onClose,
  onSubmit,
  title,
}: {
  children: ReactNode;
  description?: string;
  onClose: () => void;
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  title: string;
}): ReactElement {
  const content = (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end bg-slate-950/30 p-3 sm:items-center sm:justify-center"
      role="dialog"
    >
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-md border border-slate-200 bg-white shadow-xl">
        <div className="border-b border-slate-200 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
              {description === undefined ? null : (
                <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
              )}
            </div>
            <Button aria-label="关闭" className="min-w-11 px-2" onClick={onClose} title="关闭" variant="ghost">
              <X aria-hidden="true" className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );

  if (onSubmit === undefined) {
    return content;
  }

  return <form onSubmit={onSubmit}>{content}</form>;
}
