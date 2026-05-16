import type { ReactElement, ReactNode } from "react";

export function Notice({
  children,
  tone = "info",
}: {
  children: ReactNode;
  tone?: "info" | "error" | "success";
}): ReactElement {
  const className =
    tone === "error"
      ? "border-red-200 bg-red-50 text-red-800"
      : tone === "success"
        ? "border-teal-200 bg-teal-50 text-teal-800"
        : "border-blue-200 bg-blue-50 text-blue-800";

  return (
    <p className={`rounded-md border px-3 py-2 text-sm leading-6 ${className}`} role="status">
      {children}
    </p>
  );
}
