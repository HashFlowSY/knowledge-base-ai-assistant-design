export function normalizeSearchParam(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function updateQueryParam({
  key,
  pathname,
  router,
  searchParams,
  value,
}: {
  key: string;
  pathname: string;
  router: { replace(href: string): void };
  searchParams: { toString(): string };
  value: string;
}): void {
  const next = new URLSearchParams(searchParams.toString());

  if (value === "") {
    next.delete(key);
  } else {
    next.set(key, value);
  }

  if (key === "search") {
    next.delete("page");
    next.delete("pageSize");
    next.delete("sort");
  }

  const queryString = next.toString();
  router.replace(queryString.length > 0 ? `${pathname}?${queryString}` : pathname);
}
