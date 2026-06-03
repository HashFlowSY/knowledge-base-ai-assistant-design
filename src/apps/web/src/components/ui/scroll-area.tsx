"use client"

import * as React from "react"
import { ScrollArea as ScrollAreaPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

type ScrollAreaSize = "fill" | "sm" | "md" | "lg" | "xl"

const sizeClassNames: Record<ScrollAreaSize, string> = {
  fill: "max-h-none",
  lg: "max-h-[min(520px,74vh)]",
  md: "max-h-[min(420px,70vh)]",
  sm: "max-h-[min(320px,64vh)]",
  xl: "max-h-[min(640px,78vh)]",
}

function ScrollArea({
  "aria-label": ariaLabel,
  className,
  children,
  onScroll,
  role,
  size = "md",
  viewportRef,
  ...props
}: Omit<React.ComponentProps<typeof ScrollAreaPrimitive.Root>, "onScroll"> & {
  "aria-label"?: string
  onScroll?: React.UIEventHandler<HTMLDivElement>
  size?: ScrollAreaSize
  viewportRef?: React.Ref<HTMLDivElement>
}) {
  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      aria-label={ariaLabel}
      role={role ?? (ariaLabel === undefined ? undefined : "region")}
      className={cn("relative min-h-0", sizeClassNames[size], className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        data-slot="scroll-area-viewport"
        className="size-full rounded-[inherit] pr-1 transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1"
        onScroll={onScroll}
        ref={viewportRef}
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  )
}

function ScrollBar({
  className,
  orientation = "vertical",
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>) {
  return (
    <ScrollAreaPrimitive.ScrollAreaScrollbar
      data-slot="scroll-area-scrollbar"
      data-orientation={orientation}
      orientation={orientation}
      className={cn(
        "flex touch-none p-px transition-colors select-none data-horizontal:h-2.5 data-horizontal:flex-col data-horizontal:border-t data-horizontal:border-t-transparent data-vertical:h-full data-vertical:w-2.5 data-vertical:border-l data-vertical:border-l-transparent",
        className
      )}
      {...props}
    >
      <ScrollAreaPrimitive.ScrollAreaThumb
        data-slot="scroll-area-thumb"
        className="relative flex-1 rounded-full bg-border"
      />
    </ScrollAreaPrimitive.ScrollAreaScrollbar>
  )
}

export { ScrollArea, ScrollBar }
