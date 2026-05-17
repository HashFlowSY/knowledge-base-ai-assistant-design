export function documentDetailPageGridClassName(): string {
  return "grid min-h-0 gap-4 xl:h-[calc(100vh-121px)] xl:grid-cols-[minmax(0,1fr)_360px] xl:[&>*]:min-h-0";
}

export function documentDetailExitHref(): string {
  return "/documents";
}

export function documentDetailHeaderActionsClassName(): string {
  return "flex flex-wrap gap-2";
}

export function documentDetailTaskHref(jobIds: string[]): string {
  return detailHref("/tasks", jobIds[0] ?? null);
}

export function documentDetailLogHref(logId: string | null): string {
  return detailHref("/logs", logId);
}

export function documentDetailRelatedLogIds(
  jobs: { id: string; logIds: string[] }[],
  jobIds: string[],
): string[] {
  const allowed = new Set(jobIds);

  return jobs
    .filter((job) => allowed.has(job.id))
    .flatMap((job) => job.logIds);
}

export function latestDocumentLogId(
  logs: { id: string; createdAt: string }[],
  logIds: string[],
): string | null {
  const allowed = new Set(logIds);
  const latest = logs
    .filter((log) => allowed.has(log.id))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];

  return latest?.id ?? null;
}

export function documentDetailSideClassName(): string {
  return "min-h-0 space-y-4 xl:flex xl:h-full xl:min-h-0 xl:flex-col xl:overflow-hidden";
}

export function documentChunkPlaceholderClassName(): string {
  return "xl:flex xl:min-h-0 xl:flex-1 xl:flex-col xl:overflow-hidden";
}

export function documentDetailMainClassName(): string {
  return "min-w-0 space-y-4 xl:h-full xl:min-h-0 xl:overflow-y-auto xl:pr-1 md:[scrollbar-width:thin]";
}

export function documentChunkDetailScrollClassName(): string {
  return "space-y-4 py-4 pl-4 pr-4";
}

export function documentChunkReturnLabel(): string {
  return "返回片段列表";
}

export function documentChunkReturnButtonClassName(): string {
  return "w-full justify-center";
}

export function documentProcessingSummaryScrollClassName(): string {
  return "space-y-3 py-4 pl-4 pr-4";
}

function detailHref(pathname: string, selectedId: string | null): string {
  if (selectedId === null) {
    return pathname;
  }

  const params = new URLSearchParams({ selectedId });
  return `${pathname}?${params.toString()}`;
}
