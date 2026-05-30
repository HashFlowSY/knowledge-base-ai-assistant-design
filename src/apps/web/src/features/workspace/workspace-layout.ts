export function workspacePageGridClassName(): string {
  return "grid min-h-0 items-stretch gap-4 lg:h-[calc(100vh-121px)] lg:grid-cols-[300px_minmax(0,1fr)] lg:[&>*]:min-h-0";
}

export function workspaceKnowledgePanelClassName(): string {
  return "flex h-full min-h-0 max-lg:max-h-[min(560px,72vh)] flex-col overflow-hidden lg:[contain:size]";
}

export function workspaceContentClassName(): string {
  return "min-w-0 space-y-4 lg:h-full lg:min-h-0 lg:overflow-y-auto lg:pr-1 md:[scrollbar-width:thin]";
}

export function workspaceKnowledgeListClassName(): string {
  return "min-h-0 flex-1 divide-y divide-slate-200";
}

export function workspaceMetricGridClassName(): string {
  return "mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4";
}

export function workspaceMetricTileClassName(): string {
  return "rounded-md border border-slate-200 bg-slate-50 px-3 py-2";
}
