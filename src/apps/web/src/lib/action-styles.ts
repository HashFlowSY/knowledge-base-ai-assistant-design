export function listActionLinkClassName(): string {
  return "block min-h-11 px-4 py-3 transition hover:bg-muted/50";
}

export function listActionButtonClassName(active: boolean): string {
  return [
    "block min-h-11 w-full px-4 py-3 text-left transition hover:bg-muted/50",
    active ? "bg-muted" : "bg-card",
  ].join(" ");
}

export function cardActionButtonClassName(active: boolean): string {
  return [
    "block min-h-11 w-full rounded-3xl border p-3 text-left",
    active ? "border-ring bg-muted" : "border-border bg-card",
  ].join(" ");
}
