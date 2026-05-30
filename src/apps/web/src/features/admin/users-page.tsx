"use client";

import { Search, UserPlus } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, type ReactElement } from "react";

import type { UserSummary } from "@kb/users";
import { listUsersQuerySchema } from "@kb/users";

import { adminCopy } from "../../copy/admin";
import { useSessionQuery } from "../auth/auth-hooks";
import { Button } from "../ui/button";
import { Notice } from "../ui/notice";
import { Panel, PanelHeader } from "../ui/panel";
import { ScrollArea } from "../ui/scroll-area";
import { SelectField } from "../ui/select-field";
import { ProtectedPage } from "../shell/protected-page";
import { AdminEmptyState } from "./admin-empty-state";
import {
  adminListPanelClassName,
  adminListScrollClassName,
  adminPageGridClassName,
} from "./admin-list-layout";
import { AdminPagination } from "./admin-pagination";
import { canRemoveUserAccessFromUi } from "./user-ui-helpers";
import { ConfirmRemoveAccessDialog } from "./confirm-remove-access-dialog";
import { emptyUsersPage } from "./empty-users-page";
import { toSelectOptions } from "./select-options";
import { UserDetailDrawer } from "./user-detail-drawer";
import { UserDialog } from "./user-dialog";
import { UserRow } from "./user-row";
import { useRemoveUserAccess, useUsers } from "./user-hooks";

export function UsersPage(): ReactElement {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [confirm, setConfirm] = useState<(() => void) | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [userDialog, setUserDialog] = useState<UserSummary | "create" | null>(null);
  const sessionQuery = useSessionQuery();
  const selectedId = searchParams.get("selectedId");
  const query = listUsersQuerySchema.parse(Object.fromEntries(searchParams));
  const usersQuery = useUsers(query);
  const removeAccess = useRemoveUserAccess();
  const usersPage = usersQuery.data ?? emptyUsersPage(query.page, query.pageSize);
  const selectedUser = usersPage.items.find((user) => user.id === selectedId) ?? null;
  const totalPages = Math.max(1, Math.ceil(usersPage.total / query.pageSize));

  function updateParam(key: string, value: string): void {
    const next = new URLSearchParams(searchParams.toString());
    if (value === "" || value === "all") {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    if (key !== "page") {
      next.set("page", "1");
    }
    router.replace(`${pathname}?${next.toString()}`);
  }

  function selectUser(user: UserSummary): void {
    const next = new URLSearchParams(searchParams.toString());
    next.set("selectedId", user.id);
    router.replace(`${pathname}?${next.toString()}`);
  }

  function closeDetail(): void {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("selectedId");
    const queryString = next.toString();
    router.replace(queryString.length > 0 ? `${pathname}?${queryString}` : pathname);
  }

  return (
    <ProtectedPage>
      <div className={adminPageGridClassName()}>
        <Panel className={adminListPanelClassName()}>
          <PanelHeader
            action={
              <Button onClick={() => setUserDialog("create")} variant="primary">
                <UserPlus aria-hidden="true" className="h-4 w-4" />
                {adminCopy.createUser}
              </Button>
            }
            description={adminCopy.users.description}
            title={adminCopy.users.title}
          />
          <div className="grid gap-3 border-b border-slate-200 p-4 md:grid-cols-[minmax(0,1fr)_180px_180px]">
            <label className="flex min-h-11 items-center gap-2 rounded-md border border-slate-200 bg-white px-3">
              <Search aria-hidden="true" className="h-4 w-4 text-slate-400" />
              <span className="sr-only">搜索</span>
              <input
                className="min-w-0 flex-1 text-sm outline-none"
                onChange={(event) => updateParam("search", event.target.value)}
                placeholder="搜索当前列表"
                value={query.search ?? ""}
              />
            </label>
            <SelectField
              ariaLabel="筛选"
              onChange={(value) => updateParam("filter", value)}
              options={toSelectOptions([
                ["all", "全部角色"],
                ["admin", "admin"],
                ["member", "member"],
              ])}
              value={query.filter}
            />
            <SelectField
              ariaLabel="排序"
              onChange={(value) => updateParam("sort", value)}
              options={toSelectOptions([
                ["updated", "最近更新"],
                ["name", "名称"],
              ])}
              value={query.sort}
            />
          </div>
          {notice === null ? null : (
            <div className="p-4">
              <Notice tone="success">{notice}</Notice>
            </div>
          )}
          {usersQuery.isError ? (
            <div className="p-4">
              <Notice tone="error">{adminCopy.users.error}</Notice>
            </div>
          ) : usersQuery.isLoading ? (
            <div className="p-4">
              <Notice>正在加载用户列表。</Notice>
            </div>
          ) : usersPage.items.length === 0 ? (
            <AdminEmptyState message={adminCopy.users.empty} />
          ) : (
            <>
              <ScrollArea aria-label="用户列表" className={adminListScrollClassName()} size="fill">
                <div className="divide-y divide-slate-200">
                  {usersPage.items.map((user) => (
                    <UserRow
                      key={user.id}
                      onConfirm={(callback) => setConfirm(() => callback)}
                      onEdit={() => setUserDialog(user)}
                      onNotice={setNotice}
                      onRemoveAccess={async () => {
                        await removeAccess.mutateAsync(user.id);
                      }}
                      onSelect={() => selectUser(user)}
                      selfProtected={!canRemoveUserAccessFromUi({
                        currentUserId: sessionQuery.data?.user.id,
                        targetUserId: user.id,
                      })}
                      user={user}
                    />
                  ))}
                </div>
              </ScrollArea>
              <AdminPagination
                currentPage={query.page}
                pageSize={query.pageSize}
                total={usersPage.total}
                totalPages={totalPages}
                updateParam={updateParam}
              />
            </>
          )}
        </Panel>

        <UserDetailDrawer onClose={closeDetail} selectedUser={selectedUser} />
      </div>

      {confirm === null ? null : (
        <ConfirmRemoveAccessDialog
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            confirm();
            setConfirm(null);
          }}
        />
      )}
      {userDialog !== null ? (
        <UserDialog
          onClose={() => setUserDialog(null)}
          currentUserId={sessionQuery.data?.user.id ?? null}
          onNotice={setNotice}
          user={userDialog === "create" ? null : userDialog}
        />
      ) : null}
    </ProtectedPage>
  );
}
