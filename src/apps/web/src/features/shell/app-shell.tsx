"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BookOpen, LogOut, Menu } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactElement, type ReactNode } from "react";

import type { SessionPayload } from "@kb/auth";

import { commonCopy } from "../../copy/common";
import { authQueryKey, useLogoutMutation, useSessionQuery } from "../auth/auth-hooks";
import { Button } from "../ui/button";
import { Notice } from "../ui/notice";
import { AppShellSkeleton } from "../ui/skeleton";
import { shellSkeletonVariantForPath } from "../ui/skeleton-variants";
import { visibleNavigationItems } from "./navigation";
import {
  getAppShellSessionGateDecision,
} from "./session-gate";

export function AppShell({ children }: { children: ReactNode }): ReactElement {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const sessionQuery = useSessionQuery();
  const logoutMutation = useLogoutMutation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const session = sessionQuery.data ?? null;
  const gateDecision = getAppShellSessionGateDecision({
    error: sessionQuery.error,
    isLoading: sessionQuery.isLoading,
    pathname,
    session,
  });

  useEffect(() => {
    if (gateDecision.kind === "clear-session-and-redirect") {
      queryClient.removeQueries({ queryKey: authQueryKey });
      router.replace(gateDecision.href);
      return;
    }

    if (gateDecision.kind === "redirect") {
      router.replace(gateDecision.href);
    }
  }, [gateDecision, queryClient, router]);

  async function handleLogout(): Promise<void> {
    await logoutMutation.mutateAsync();
    router.replace("/login");
  }

  if (gateDecision.kind === "error") {
    return (
      <main className="min-h-screen bg-slate-100 p-4 text-slate-950">
        <div className="mx-auto max-w-xl pt-10">
          <Notice tone="error">{gateDecision.message}</Notice>
        </div>
      </main>
    );
  }

  if (gateDecision.kind !== "render" || session === null) {
    return <AppShellSkeleton variant={shellSkeletonVariantForPath(pathname)} />;
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <div className="flex min-h-screen">
        <Sidebar activePath={pathname} onLogout={handleLogout} session={session} />

        <section className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur md:hidden">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">{commonCopy.productName}</p>
                <p className="text-xs text-slate-500">{commonCopy.tenantLabel}</p>
              </div>
              <Button aria-label="打开导航" onClick={() => setMobileOpen(true)} variant="secondary">
                <Menu aria-hidden="true" className="h-4 w-4" />
                导航
              </Button>
            </div>
          </header>

          {mobileOpen ? (
            <div className="fixed inset-0 z-50 bg-slate-950/40 p-3 md:hidden">
              <div className="max-h-full overflow-y-auto rounded-md bg-slate-950 text-white">
                <Sidebar
                  activePath={pathname}
                  compact
                  onClose={() => setMobileOpen(false)}
                  onLogout={handleLogout}
                  session={session}
                />
              </div>
            </div>
          ) : null}

          <div className="mx-auto max-w-[1500px] px-4 py-4 sm:px-6 lg:px-8">{children}</div>
        </section>
      </div>
    </main>
  );
}

function Sidebar({
  activePath,
  compact = false,
  onClose,
  onLogout,
  session,
}: {
  activePath: string;
  compact?: boolean;
  onClose?: () => void;
  onLogout: () => void;
  session: SessionPayload;
}): ReactElement {
  const items = visibleNavigationItems(session.role);

  return (
    <aside
      className={`${compact ? "flex" : "hidden md:flex"} w-full shrink-0 flex-col border-r border-white/10 bg-slate-950 text-white md:w-64`}
    >
      <div className="border-b border-white/10 p-5">
        <div className="flex h-11 w-11 items-center justify-center rounded-md bg-teal-500 text-white">
          <BookOpen aria-hidden="true" className="h-5 w-5" />
        </div>
        <h2 className="mt-4 text-base font-semibold">{commonCopy.productName}</h2>
        <p className="mt-1 text-sm leading-6 text-slate-300">{commonCopy.tenantLabel}</p>
      </div>

      <nav aria-label="全局导航" className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3">
        {items.map((item) => {
          const Icon = item.icon;
          const active = activePath === item.href || activePath.startsWith(`${item.href}/`);
          const closeProps = onClose === undefined ? {} : { onClick: onClose };
          return (
            <Link
              aria-current={active ? "page" : undefined}
              className={[
                "group flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm transition",
                active ? "bg-white text-slate-950" : "text-slate-300 hover:bg-white/10 hover:text-white",
              ].join(" ")}
              href={item.href}
              key={item.href}
              {...closeProps}
            >
              <span
                className={[
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
                  active ? "bg-teal-50 text-teal-700" : "bg-white/5 text-slate-300",
                ].join(" ")}
              >
                <Icon aria-hidden="true" className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block truncate font-medium">{item.label}</span>
                <span className="block truncate text-xs text-slate-400 group-hover:text-slate-300">
                  {item.description}
                </span>
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="space-y-3 border-t border-white/10 p-4">
        <div>
          <p className="text-sm font-medium">{session.user.name}</p>
          <p className="mt-1 text-xs text-slate-400">{session.role}</p>
        </div>
        <Button className="w-full" onClick={onLogout} variant="inverse">
          <LogOut aria-hidden="true" className="h-4 w-4" />
          {commonCopy.logout}
        </Button>
      </div>
    </aside>
  );
}
