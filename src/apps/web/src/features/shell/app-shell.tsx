"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BookOpen, ClockAlert, LogOut, Menu, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState, type ReactElement, type ReactNode } from "react";

import { commonCopy } from "../../copy/common";
import { getRouteAccess, useMockStore } from "../mock/store";
import type { MockRole } from "../mock/types";
import { Button } from "../ui/button";
import { Notice } from "../ui/notice";
import { SelectField } from "../ui/select-field";
import { AppShellSkeleton } from "../ui/skeleton";
import { shellSkeletonVariantForPath } from "../ui/skeleton-variants";
import { visibleNavigationItems } from "./navigation";

export function AppShell({ children }: { children: ReactNode }): ReactElement {
  const pathname = usePathname();
  const router = useRouter();
  const { dismissNotice, dispatch, hydrated, notice, state } = useMockStore();
  const [mobileOpen, setMobileOpen] = useState(false);
  const routeAccess = useMemo(
    () => getRouteAccess(state.session, pathname),
    [pathname, state.session],
  );
  const user = state.users.find((item) => item.id === state.session.userId);

  useEffect(() => {
    if (hydrated && !routeAccess.allowed) {
      router.replace(routeAccess.redirectTo);
    }
  }, [hydrated, routeAccess, router]);

  if (!hydrated || !routeAccess.allowed) {
    return <AppShellSkeleton variant={shellSkeletonVariantForPath(pathname)} />;
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <div className="flex min-h-screen">
        <Sidebar
          activePath={pathname}
          onExpireSession={() => dispatch({ intendedRedirectTo: pathname, type: "expireSession" })}
          onLogout={() => dispatch({ type: "logout" })}
          onReset={() => dispatch({ type: "resetDemoData" })}
          onSwitchRole={(role) => dispatch({ role, type: "switchRole" })}
          role={state.session.role}
          userName={user?.name ?? "未登录"}
        />

        <section className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur md:hidden">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">{commonCopy.productName}</p>
                <p className="text-xs text-slate-500">{commonCopy.mockNotice}</p>
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
                  onExpireSession={() => dispatch({ intendedRedirectTo: pathname, type: "expireSession" })}
                  onLogout={() => dispatch({ type: "logout" })}
                  onReset={() => dispatch({ type: "resetDemoData" })}
                  onSwitchRole={(role) => dispatch({ role, type: "switchRole" })}
                  role={state.session.role}
                  userName={user?.name ?? "未登录"}
                />
              </div>
            </div>
          ) : null}

          <div className="mx-auto max-w-[1500px] px-4 py-4 sm:px-6 lg:px-8">
            {notice === null ? null : (
              <div className="mb-4">
                <Notice tone="info">
                  <span>{notice}</span>
                  <button className="ml-3 underline" onClick={dismissNotice} type="button">
                    知道了
                  </button>
                </Notice>
              </div>
            )}
            {children}
          </div>
        </section>
      </div>
    </main>
  );
}

function Sidebar({
  activePath,
  compact = false,
  onClose,
  onExpireSession,
  onLogout,
  onReset,
  onSwitchRole,
  role,
  userName,
}: {
  activePath: string;
  compact?: boolean;
  onClose?: () => void;
  onExpireSession: () => void;
  onLogout: () => void;
  onReset: () => void;
  onSwitchRole: (role: MockRole) => void;
  role: MockRole | null;
  userName: string;
}): ReactElement {
  const items = visibleNavigationItems(role);

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
                active
                  ? "bg-white text-slate-950"
                  : "text-slate-300 hover:bg-white/10 hover:text-white",
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
          <p className="text-sm font-medium">{userName}</p>
          <p className="mt-1 text-xs text-slate-400">
            {commonCopy.mockNotice} · {role ?? "未登录"}
          </p>
        </div>
        <div>
          <p className="mb-2 text-xs font-medium text-slate-300">{commonCopy.roleSwitcher}</p>
          <SelectField
            ariaLabel={commonCopy.roleSwitcher}
            onChange={(value) => onSwitchRole(value as MockRole)}
            options={[
              { label: "admin", value: "admin" },
              { label: "member", value: "member" },
            ]}
            tone="inverse"
            value={role ?? "admin"}
          />
        </div>
        <Button className="w-full" onClick={onReset} variant="inverse">
          <RotateCcw aria-hidden="true" className="h-4 w-4" />
          {commonCopy.resetDemoData}
        </Button>
        <Button className="w-full" onClick={onExpireSession} variant="inverse">
          <ClockAlert aria-hidden="true" className="h-4 w-4" />
          模拟会话过期
        </Button>
        <Button className="w-full" onClick={onLogout} variant="inverse">
          <LogOut aria-hidden="true" className="h-4 w-4" />
          {commonCopy.logout}
        </Button>
      </div>
    </aside>
  );
}
