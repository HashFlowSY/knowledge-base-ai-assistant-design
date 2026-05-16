export function listActionLinkClassName(): string {
  return "block min-h-11 px-4 py-3 transition hover:bg-slate-50";
}

export function listActionButtonClassName(active: boolean): string {
  return [
    "block min-h-11 w-full px-4 py-3 text-left transition hover:bg-slate-50",
    active ? "bg-teal-50" : "bg-white",
  ].join(" ");
}

export function cardActionButtonClassName(active: boolean): string {
  return [
    "block min-h-11 w-full rounded-md border p-3 text-left",
    active ? "border-teal-300 bg-teal-50" : "border-slate-200 bg-slate-50",
  ].join(" ");
}
