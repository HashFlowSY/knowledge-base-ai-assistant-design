export function drawerClassName(): string {
  return [
    "fixed inset-x-0 bottom-0 z-50 flex max-h-[72vh] min-h-0 flex-col overflow-hidden rounded-t-md",
    "border border-slate-200 bg-white shadow-xl",
    "lg:static lg:h-full lg:max-h-full lg:flex-1 lg:overflow-hidden lg:rounded-md lg:shadow-sm",
  ].join(" ");
}

export function drawerHeaderClassName(): string {
  return "flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 p-4";
}

export function drawerBodyClassName(): string {
  return "min-h-0 flex-1 overflow-y-auto p-4 lg:overflow-y-auto";
}
