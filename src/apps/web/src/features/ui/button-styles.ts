export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "inverse";

export function buttonClassName(variant: ButtonVariant): string {
  const base =
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60";
  const variants: Record<ButtonVariant, string> = {
    danger: "border-red-200 bg-red-50 text-red-700 hover:bg-red-100",
    ghost: "border-transparent bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-950",
    inverse: "border-white/10 bg-slate-900 text-white hover:bg-slate-800",
    primary: "border-teal-700 bg-teal-700 text-white hover:bg-teal-800",
    secondary: "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
  };

  return `${base} ${variants[variant]}`;
}
