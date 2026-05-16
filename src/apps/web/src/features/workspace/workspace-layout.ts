import type { MockDocument, MockIngestionJob, MockKnowledgeBaseStatus, MockProcessingLog } from "../mock/types";

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

export function workspaceSummaryGridClassName(showProcessingLogs: boolean): string {
  const desktopColumns = showProcessingLogs
    ? "lg:grid-cols-[minmax(0,1.2fr)_minmax(260px,0.8fr)] xl:grid-cols-3"
    : "lg:grid-cols-2";

  return `grid items-stretch gap-4 [&>section]:flex [&>section]:min-h-[360px] [&>section]:flex-col max-lg:[&>section]:min-h-0 ${desktopColumns}`;
}

export function workspaceMetricGridClassName(): string {
  return "mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4";
}

export function workspaceMetricTileClassName(): string {
  return "rounded-md border border-slate-200 bg-slate-50 px-3 py-2";
}

export function shouldShowKnowledgeBaseListStatus(status: MockKnowledgeBaseStatus): boolean {
  return status !== "ready";
}

export function workspaceSummaryListClassName(): string {
  return "flex-1 divide-y divide-slate-200";
}

export function workspaceVisibleDocuments(documents: MockDocument[]): MockDocument[] {
  return documents;
}

export function workspaceVisibleJobs(jobs: MockIngestionJob[]): MockIngestionJob[] {
  return jobs;
}

export function workspaceVisibleLogs(logs: MockProcessingLog[]): MockProcessingLog[] {
  return logs;
}

export function workspaceSummaryListItemClassName(interactive: boolean): string {
  return [
    "block min-h-11 px-4 py-3",
    interactive ? "transition hover:bg-slate-50" : "",
  ].filter(Boolean).join(" ");
}

export function workspaceSummaryEmptyClassName(): string {
  return "flex min-h-[120px] items-start px-4 py-4";
}

export function workspaceTaskSummaryHref(jobId: string): string {
  return summaryHref("/tasks", jobId);
}

export function workspaceLogSummaryHref(logId: string): string {
  return summaryHref("/logs", logId);
}

function summaryHref(pathname: string, selectedId: string): string {
  const params = new URLSearchParams({ selectedId });
  return `${pathname}?${params.toString()}`;
}
