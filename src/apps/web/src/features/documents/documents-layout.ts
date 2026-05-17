export function documentsPanelClassName(): string {
  return "min-h-0 overflow-hidden xl:flex xl:h-[calc(100vh-121px)] xl:min-h-0 xl:flex-col";
}

export function documentsListScrollClassName(): string {
  return "divide-y divide-slate-200 xl:flex-1";
}

export interface PaginatedDocuments<T> {
  currentPage: number;
  items: T[];
  pageSize: number;
  total: number;
  totalPages: number;
}

export function parseDocumentPageParam(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function paginateDocuments<T>(
  items: T[],
  page: number,
  pageSize: number,
): PaginatedDocuments<T> {
  const normalizedPageSize = Number.isFinite(pageSize) && pageSize > 0 ? pageSize : 8;
  const totalPages = Math.max(1, Math.ceil(items.length / normalizedPageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = (currentPage - 1) * normalizedPageSize;

  return {
    currentPage,
    items: items.slice(start, start + normalizedPageSize),
    pageSize: normalizedPageSize,
    total: items.length,
    totalPages,
  };
}
