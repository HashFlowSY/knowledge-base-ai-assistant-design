import type { ReactElement, ReactNode } from "react";

type Tone = "slate" | "teal" | "red" | "yellow" | "blue";

const toneClassName: Record<Tone, string> = {
  blue: "border-blue-200 bg-blue-50 text-blue-700",
  red: "border-red-200 bg-red-50 text-red-700",
  slate: "border-slate-200 bg-slate-50 text-slate-600",
  teal: "border-teal-200 bg-teal-50 text-teal-700",
  yellow: "border-yellow-200 bg-yellow-50 text-yellow-800",
};

export function StatusPill({
  children,
  tone = "slate",
}: {
  children: ReactNode;
  tone?: Tone;
}): ReactElement {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-md border px-2 py-1 text-xs font-medium ${toneClassName[tone]}`}
    >
      {children}
    </span>
  );
}
