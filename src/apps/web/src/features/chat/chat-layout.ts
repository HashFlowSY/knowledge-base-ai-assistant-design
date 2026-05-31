import type { SelectFieldPlacement } from "@/components/ui/select";

export function chatLayoutGridClassName(): string {
  return "grid min-h-0 items-start gap-4 xl:h-[calc(100vh-121px)] xl:grid-cols-[240px_minmax(520px,1fr)_300px] xl:items-stretch";
}

export function chatPanelHeaderClassName(): string {
  return "min-h-[137px] xl:min-h-[137px]";
}

export function chatPanelClassName(): string {
  return "flex h-full min-h-0 min-w-0 flex-col gap-0 overflow-hidden pb-0";
}

export function chatMessagesFrameClassName(): string {
  return "flex min-h-0 flex-1 flex-col overflow-hidden";
}

export function chatSessionScrollClassName(): string {
  return "min-h-0 flex-1 divide-y divide-border";
}

export function chatMessageScrollClassName(): string {
  return "min-h-0 flex-1 space-y-4 py-4 pl-4 pr-4";
}

export function chatCitationScrollClassName(): string {
  return "min-h-0 flex-1 space-y-4 py-4 pl-4 pr-4";
}

export function chatComposerGridClassName(): string {
  return "grid items-stretch gap-3 lg:grid-cols-[180px_minmax(0,1fr)_136px]";
}

export function chatModeSelectClassName(): string {
  return "[&>button]:h-14";
}

export function chatTextareaClassName(): string {
  return [
    "h-14 min-h-[56px] w-full resize-none rounded-3xl border border-border px-3 py-3 text-sm leading-6 outline-none",
    "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30",
  ].join(" ");
}

export function chatSubmitButtonClassName(): string {
  return "h-14 min-h-[56px] w-full py-0 lg:w-full";
}

export function chatModeSelectPlacement(): SelectFieldPlacement {
  return "top";
}
