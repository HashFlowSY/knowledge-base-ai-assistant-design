import type { ReactElement } from "react";

import type { AppShellSkeletonVariant } from "./skeleton-variants";

export function SkeletonBlock({
  className = "",
  label = "加载中",
}: {
  className?: string;
  label?: string;
}): ReactElement {
  return (
    <span
      aria-label={label}
      className={`block animate-pulse rounded-md bg-slate-200 ${className}`}
      role="status"
    />
  );
}

export function SkeletonText({ lines = 3 }: { lines?: number }): ReactElement {
  return (
    <div className="space-y-2">
      {Array.from({ length: lines }).map((_, index) => (
        <SkeletonBlock
          className={index === lines - 1 ? "h-3 w-2/3" : "h-3 w-full"}
          key={`line-${index}`}
        />
      ))}
    </div>
  );
}

export function SkeletonCard(): ReactElement {
  return (
    <section className="rounded-md border border-slate-200 bg-white p-4">
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
  );
}

export function SkeletonTable({ rows = 5 }: { rows?: number }): ReactElement {
  return (
    <section className="rounded-md border border-slate-200 bg-white">
      <div className="border-b border-slate-200 p-4">
        <SkeletonBlock className="h-10 w-full max-w-lg" />
      </div>
      <div className="divide-y divide-slate-200">
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
  );
}

export function SkeletonDrawer(): ReactElement {
  return (
    <aside className="rounded-md border border-slate-200 bg-white p-4">
      <SkeletonBlock className="h-5 w-40" />
      <div className="mt-5 space-y-4">
        <SkeletonText lines={5} />
        <SkeletonBlock className="h-24" />
      </div>
    </aside>
  );
}

export function AppShellSkeleton({
  variant = "workspace",
}: {
  variant?: AppShellSkeletonVariant;
}): ReactElement {
  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <div className="flex min-h-screen">
        <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-slate-950 p-4 md:block">
          <SkeletonBlock className="h-11 w-11 bg-slate-700" />
          <div className="mt-8 space-y-3">
            {Array.from({ length: 7 }).map((_, index) => (
              <SkeletonBlock className="h-11 bg-slate-800" key={`nav-${index}`} />
            ))}
          </div>
        </aside>
        <section className="min-w-0 flex-1 p-4 sm:p-6">
          <SkeletonBlock className="h-10 w-full max-w-sm" />
          <div className="mt-5">{renderShellVariant(variant)}</div>
        </section>
      </div>
    </main>
  );
}

function renderShellVariant(variant: "workspace" | "table" | "chat" | "document"): ReactElement {
  if (variant === "table") {
    return <SkeletonTable rows={6} />;
  }
  if (variant === "chat") {
    return (
      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)_320px]">
        <SkeletonTable rows={4} />
        <SkeletonCard />
        <SkeletonDrawer />
      </div>
    );
  }
  if (variant === "document") {
    return (
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <SkeletonCard />
        <SkeletonDrawer />
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      <SkeletonTable rows={5} />
      <SkeletonCard />
    </div>
  );
}
