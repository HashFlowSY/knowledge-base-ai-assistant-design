import type { ReactElement } from "react"

import {
  shellSkeletonVariantForPath,
  type AppShellSkeletonVariant,
} from "@/components/ui/skeleton-variants"
import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-2xl bg-muted", className)}
      {...props}
    />
  )
}

function SkeletonBlock({
  className,
  label = "加载中",
}: {
  className?: string
  label?: string
}): ReactElement {
  return <Skeleton aria-label={label} className={className} role="status" />
}

function SkeletonText({ lines = 3 }: { lines?: number }): ReactElement {
  return (
    <div className="space-y-2">
      {Array.from({ length: lines }).map((_, index) => (
        <SkeletonBlock
          className={index === lines - 1 ? "h-3 w-2/3" : "h-3 w-full"}
          key={`line-${index}`}
        />
      ))}
    </div>
  )
}

function SkeletonCard(): ReactElement {
  return (
    <section className="rounded-4xl bg-card p-6 shadow-md ring-1 ring-foreground/5">
      <SkeletonBlock className="h-4 w-36" />
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <SkeletonBlock className="h-16" />
        <SkeletonBlock className="h-16" />
        <SkeletonBlock className="h-16" />
      </div>
      <div className="mt-4">
        <SkeletonText lines={4} />
      </div>
    </section>
  )
}

function SkeletonTable({ rows = 5 }: { rows?: number }): ReactElement {
  return (
    <section className="overflow-hidden rounded-4xl bg-card shadow-md ring-1 ring-foreground/5">
      <div className="border-b border-border p-6">
        <SkeletonBlock className="h-10 w-full max-w-lg" />
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: rows }).map((_, index) => (
          <div className="grid gap-3 p-4 md:grid-cols-5" key={`row-${index}`}>
            <SkeletonBlock className="h-4" />
            <SkeletonBlock className="h-4" />
            <SkeletonBlock className="h-4" />
            <SkeletonBlock className="h-4" />
            <SkeletonBlock className="h-9" />
          </div>
        ))}
      </div>
    </section>
  )
}

function SkeletonDrawer(): ReactElement {
  return (
    <aside className="rounded-4xl bg-card p-6 shadow-md ring-1 ring-foreground/5">
      <SkeletonBlock className="h-5 w-40" />
      <div className="mt-5 space-y-4">
        <SkeletonText lines={5} />
        <SkeletonBlock className="h-24" />
      </div>
    </aside>
  )
}

function AppShellSkeleton({
  variant = "workspace",
}: {
  variant?: AppShellSkeletonVariant
}): ReactElement {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="flex min-h-screen">
        <aside className="hidden w-64 shrink-0 border-r border-sidebar-border bg-sidebar p-4 text-sidebar-foreground md:block">
          <SkeletonBlock className="h-11 w-11 bg-sidebar-accent" />
          <div className="mt-8 space-y-3">
            {Array.from({ length: 7 }).map((_, index) => (
              <SkeletonBlock
                className="h-11 bg-sidebar-accent"
                key={`nav-${index}`}
              />
            ))}
          </div>
        </aside>
        <section className="min-w-0 flex-1 p-4 sm:p-6">
          <SkeletonBlock className="h-10 w-full max-w-sm" />
          <div className="mt-5">{renderShellVariant(variant)}</div>
        </section>
      </div>
    </main>
  )
}

function renderShellVariant(
  variant: AppShellSkeletonVariant | "document"
): ReactElement {
  if (variant === "table") {
    return <SkeletonTable rows={6} />
  }
  if (variant === "chat") {
    return (
      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)_320px]">
        <SkeletonTable rows={4} />
        <SkeletonCard />
        <SkeletonDrawer />
      </div>
    )
  }
  if (variant === "document") {
    return (
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <SkeletonCard />
        <SkeletonDrawer />
      </div>
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      <SkeletonTable rows={5} />
      <SkeletonCard />
    </div>
  )
}

export {
  AppShellSkeleton,
  Skeleton,
  SkeletonBlock,
  SkeletonCard,
  SkeletonDrawer,
  SkeletonTable,
  SkeletonText,
  shellSkeletonVariantForPath,
}
export type { AppShellSkeletonVariant }
