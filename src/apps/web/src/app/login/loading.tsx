import type { ReactElement } from "react";

import { SkeletonBlock } from "@/components/ui/skeleton";

export default function LoginLoading(): ReactElement {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <section className="w-full max-w-md rounded-3xl border border-border bg-card p-5">
        <SkeletonBlock className="h-6 w-48" />
        <div className="mt-6 space-y-4">
          <SkeletonBlock className="h-11 w-full" />
          <SkeletonBlock className="h-11 w-full" />
          <SkeletonBlock className="h-11 w-full" />
        </div>
      </section>
    </main>
  );
}
