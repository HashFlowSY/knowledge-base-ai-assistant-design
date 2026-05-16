export function adminPageGridClassName(): string {
  return "grid min-h-0 items-stretch gap-4 xl:h-[calc(100vh-121px)] xl:grid-cols-[minmax(0,1fr)_360px]";
}

export function adminListPanelClassName(): string {
  return "min-w-0 overflow-hidden xl:flex xl:h-full xl:min-h-0 xl:flex-col";
}

export function adminListScrollClassName(): string {
  return "xl:flex-1";
}

export function adminRowClassName(): string {
  return "grid gap-3 px-4 py-3 md:grid-cols-[minmax(280px,1fr)_auto] md:items-center";
}

export function adminRowPrimaryActionClassName(): string {
  return "flex min-h-11 min-w-0 flex-col justify-center text-left";
}

export function adminRowMetaClassName(): string {
  return "flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-600";
}

export function adminRowActionClassName(): string {
  return "flex flex-wrap gap-2 md:justify-end";
}

export function adminRowSideClassName(): string {
  return "flex min-w-0 max-w-[360px] flex-col gap-3 md:items-end";
}
