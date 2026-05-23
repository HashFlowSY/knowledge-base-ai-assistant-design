import { createElement, type HTMLAttributes, type ReactElement, type ReactNode } from "react";

type ScrollAreaSize = "fill" | "sm" | "md" | "lg" | "xl";

const sizeClassNames: Record<ScrollAreaSize, string> = {
  fill: "max-h-none",
  lg: "max-h-[min(520px,74vh)]",
  md: "max-h-[min(420px,70vh)]",
  sm: "max-h-[min(320px,64vh)]",
  xl: "max-h-[min(640px,78vh)]",
};

export function ScrollArea({
  "aria-label": ariaLabel,
  children,
  className = "",
  size = "md",
  ...props
}: {
  "aria-label"?: string;
  children: ReactNode;
  className?: string;
  size?: ScrollAreaSize;
} & Omit<HTMLAttributes<HTMLDivElement>, "aria-label" | "children" | "className">): ReactElement {
  return createElement(
    "div",
    {
      ...props,
      "aria-label": ariaLabel,
      className: scrollAreaClassName(size, className),
      role: props.role ?? (ariaLabel === undefined ? undefined : "region"),
    },
    children,
  );
}

export function scrollAreaClassName(size: ScrollAreaSize = "md", className = ""): string {
  return [
    "min-h-0 overflow-y-auto overscroll-contain pr-1 md:[scrollbar-width:thin]",
    sizeClassNames[size],
    className,
  ]
    .filter(Boolean)
    .join(" ");
}
