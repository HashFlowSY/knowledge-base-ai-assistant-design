export function selectFieldRootClassName(className = ""): string {
  return `relative ${className}`;
}

export function selectFieldTriggerClassName(tone: SelectFieldTone = "default"): string {
  const base =
    "flex min-h-11 w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100";

  if (tone === "inverse") {
    return `${base} border-white/10 bg-slate-900 text-white hover:bg-slate-800`;
  }

  return `${base} border-slate-200 bg-white text-slate-800 hover:bg-slate-50`;
}

export function selectFieldMenuClassName(
  tone: SelectFieldTone = "default",
  placement: SelectFieldPlacement = "bottom",
): string {
  const surface = tone === "inverse"
    ? "border-white/10 bg-slate-900 text-white shadow-2xl"
    : "border-slate-200 bg-white text-slate-900 shadow-lg";
  const position = placement === "top" ? "bottom-[calc(100%+4px)]" : "top-[calc(100%+4px)]";

  return [
    "absolute left-0 z-50 max-h-64 w-full overflow-y-auto rounded-md border py-1",
    position,
    surface,
  ].join(" ");
}

export function selectFieldOptionClassName(active: boolean, tone: SelectFieldTone = "default"): string {
  if (tone === "inverse") {
    return [
      "flex min-h-11 w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm",
      active ? "bg-teal-500 text-white" : "text-slate-200 hover:bg-white/10",
    ].join(" ");
  }

  return [
    "flex min-h-11 w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm",
    active ? "bg-teal-50 text-teal-800" : "text-slate-700 hover:bg-slate-50",
  ].join(" ");
}

export type SelectFieldTone = "default" | "inverse";
export type SelectFieldPlacement = "bottom" | "top";
