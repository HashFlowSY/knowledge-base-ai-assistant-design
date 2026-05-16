import type { ReactElement, ReactNode } from "react";

export function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}): ReactElement {
  return (
    <section className={`rounded-md border border-slate-200 bg-white shadow-sm ${className}`}>
      {children}
    </section>
  );
}

export function PanelHeader({
  action,
  children,
  className = "",
  description,
  title,
}: {
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
  description?: string;
  title: string;
}): ReactElement {
  return (
    <div className={`border-b border-slate-200 p-4 ${className}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-slate-950">{title}</h1>
          {description === undefined ? null : (
            <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
          )}
          {children}
        </div>
        {action}
      </div>
    </div>
  );
}
