"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Pencil, Search, Trash2, UserPlus } from "lucide-react";
import { type ReactElement, useState } from "react";

import type { ProviderSummary } from "@kb/ai-providers";
import type { UserSummary, UsersPage } from "@kb/users";
import { listUsersQuerySchema } from "@kb/users";

import { adminCopy } from "../../copy/admin";
import { Button } from "../ui/button";
import { Drawer } from "../ui/drawer";
import { Notice } from "../ui/notice";
import { Panel, PanelHeader } from "../ui/panel";
import { ScrollArea } from "../ui/scroll-area";
import { SelectField, type SelectFieldOption } from "../ui/select-field";
import { ProtectedPage } from "../shell/protected-page";
import {
  adminListPanelClassName,
  adminListScrollClassName,
  adminPageGridClassName,
  adminRowActionClassName,
  adminRowClassName,
  adminRowMetaClassName,
  adminRowPrimaryActionClassName,
  adminRowSideClassName,
} from "./admin-list-layout";
import { canRemoveUserAccessFromUi } from "./user-ui-helpers";
import { AdminPagination } from "./admin-pagination";
import { UserDialog } from "./user-dialog";
import { useSessionQuery } from "../auth/auth-hooks";
import { useRemoveUserAccess, useUsers } from "./user-hooks";
import { ProviderConfigDialog } from "./provider-config-dialog";
import { useProviders, useSaveProviderConfig } from "./provider-hooks";
import { providerListColumnLabels, providerRowView } from "./provider-page-view";

export type AdminPageKind = "tasks" | "logs" | "providers" | "users" | "audit";

export function AdminListPage({ kind }: { kind: AdminPageKind }): ReactElement {
  if (kind === "providers") {
    return <ProvidersPage />;
  }

  if (kind !== "users") {
    return (
      <ProtectedPage>
        <Panel>
          <PanelHeader description={adminCopy[kind].description} title={adminCopy[kind].title} />
          <div className="p-4">
            <Notice>该页面已移除前端 mock 数据，等待后续真实 API 接入。</Notice>
          </div>
        </Panel>
      </ProtectedPage>
    );
  }

  return <UsersPage />;
}

function ProvidersPage(): ReactElement {
  const [notice, setNotice] = useState<string | null>(null);
  const [providerDialog, setProviderDialog] = useState<ProviderSummary | null>(null);
  const providersQuery = useProviders();
  const saveProvider = useSaveProviderConfig();
  const providers = providersQuery.data ?? [];

  return (
    <ProtectedPage>
      <Panel className={adminListPanelClassName()}>
        <PanelHeader
          description={adminCopy.providers.description}
          title={adminCopy.providers.title}
        />
        {notice === null ? null : (
          <div className="p-4">
            <Notice tone="success">{notice}</Notice>
          </div>
        )}
        {providersQuery.isError ? (
          <div className="p-4">
            <Notice tone="error">{adminCopy.providers.error}</Notice>
          </div>
        ) : providersQuery.isLoading ? (
          <div className="p-4">
            <Notice>正在加载模型服务配置。</Notice>
          </div>
        ) : providers.length === 0 ? (
          <EmptyState message={adminCopy.providers.empty} />
        ) : (
          <ScrollArea aria-label="模型服务列表" className={adminListScrollClassName()} size="fill">
            <div className="overflow-x-auto">
              <div className="min-w-[920px]">
                <div
                  className={`${providerGridClassName()} border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-medium text-slate-500`}
                >
                  {providerListColumnLabels.map((label) => (
                    <span key={label}>{label}</span>
                  ))}
                </div>
                <div className="divide-y divide-slate-200">
                  {providers.map((provider) => (
                    <ProviderRow
                      key={provider.kind}
                      onEdit={() => setProviderDialog(provider)}
                      provider={provider}
                    />
                  ))}
                </div>
              </div>
            </div>
          </ScrollArea>
        )}
      </Panel>

      {providerDialog === null ? null : (
        <ProviderConfigDialog
          isSaving={saveProvider.isPending}
          kind={providerDialog.kind}
          onClose={() => setProviderDialog(null)}
          onNotice={setNotice}
          onSave={async (input) => {
            await saveProvider.mutateAsync({
              ...input,
              kind: providerDialog.kind,
            });
          }}
          provider={providerDialog}
        />
      )}
    </ProtectedPage>
  );
}

function ProviderRow({
  onEdit,
  provider,
}: {
  onEdit: () => void;
  provider: ProviderSummary;
}): ReactElement {
  const view = providerRowView(provider);

  return (
    <div className={`${providerGridClassName()} items-center px-4 py-3 text-sm`}>
      <button className={adminRowPrimaryActionClassName()} onClick={onEdit} type="button">
        <p className="truncate text-sm font-semibold text-slate-950">
          {view.title}
        </p>
        <p className="mt-1 text-xs text-slate-500">{view.subtitle}</p>
      </button>
      <ProviderCell value={view.providerName} />
      <ProviderCell value={view.modelId} />
      <ProviderCell value={view.baseUrl} />
      <ProviderCell value={view.updatedAt} />
      <div className="flex justify-end">
        <Button onClick={onEdit}>
          <Pencil aria-hidden="true" className="h-4 w-4" />
          {view.actionLabel}
        </Button>
      </div>
    </div>
  );
}

function ProviderCell({ value }: { value: string }): ReactElement {
  return (
    <span className="min-w-0 truncate text-slate-600" title={value}>
      {value}
    </span>
  );
}

function UsersPage(): ReactElement {
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
            <EmptyState message={adminCopy.users.empty} />
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

        <DetailDrawer onClose={closeDetail} selectedUser={selectedUser} />
      </div>

      {confirm === null ? null : (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
          role="dialog"
        >
          <section className="w-full max-w-md rounded-md border border-slate-200 bg-white p-4 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-950">确认操作</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">该操作会移除用户默认租户访问权，是否继续？</p>
            <div className="mt-4 flex justify-end gap-2">
              <Button onClick={() => setConfirm(null)}>取消</Button>
              <Button
                onClick={() => {
                  confirm();
                  setConfirm(null);
                }}
                variant="primary"
              >
                确认
              </Button>
            </div>
          </section>
        </div>
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

function emptyUsersPage(page: number, pageSize: number): UsersPage {
  return {
    items: [],
    page,
    pageSize,
    total: 0,
  };
}

function UserRow({
  onConfirm,
  onEdit,
  onNotice,
  onRemoveAccess,
  onSelect,
  selfProtected,
  user,
}: {
  onConfirm: (callback: () => void) => void;
  onEdit: () => void;
  onNotice: (notice: string) => void;
  onRemoveAccess: () => Promise<void>;
  onSelect: () => void;
  selfProtected: boolean;
  user: UserSummary;
}): ReactElement {
  return (
    <div className={adminRowClassName()}>
      <button className={adminRowPrimaryActionClassName()} onClick={onSelect} type="button">
        <p className="truncate text-sm font-semibold text-slate-950">{user.name}</p>
        <p className="mt-1 text-xs text-slate-500">{user.email}</p>
      </button>
      <div className={adminRowSideClassName()}>
        <div className={adminRowMetaClassName()}>
          <span>{user.role}</span>
          <span>{user.updatedAt.slice(0, 10)}</span>
        </div>
        <div className={adminRowActionClassName()}>
          <Button onClick={onSelect}>查看</Button>
          <Button onClick={onEdit}>
            <Pencil aria-hidden="true" className="h-4 w-4" />
            编辑
          </Button>
          <Button
            disabled={selfProtected}
            disabledReason="不能移除当前登录管理员的访问权。"
            onClick={() =>
              onConfirm(() => {
                void onRemoveAccess().then(() => onNotice("用户访问权已移除。"));
              })
            }
            variant="danger"
          >
            <Trash2 aria-hidden="true" className="h-4 w-4" />
            删除
          </Button>
        </div>
      </div>
    </div>
  );
}

function DetailDrawer({
  onClose,
  selectedUser,
}: {
  onClose: () => void;
  selectedUser: UserSummary | null;
}): ReactElement {
  if (selectedUser === null) {
    return (
      <Panel>
        <PanelHeader title="详情" />
        <div className="p-4">
          <Notice>选择一行后查看用户详情。</Notice>
        </div>
      </Panel>
    );
  }

  return (
    <Drawer onClose={onClose} title="详情">
      <div className="space-y-3">
        <Info label="用户" value={selectedUser.name} />
        <Info label="邮箱" value={selectedUser.email} />
        <Info label="角色" value={selectedUser.role} />
        <Info label="创建时间" value={selectedUser.createdAt} />
        <Info label="更新时间" value={selectedUser.updatedAt} />
      </div>
    </Drawer>
  );
}

function Info({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm text-slate-800">{value}</p>
    </div>
  );
}

function EmptyState({ message }: { message: string }): ReactElement {
  return (
    <div className="p-4">
      <Notice>{message}</Notice>
    </div>
  );
}

function providerGridClassName(): string {
  return "grid min-w-0 grid-cols-[minmax(180px,1.1fr)_minmax(120px,.9fr)_minmax(150px,1fr)_minmax(220px,1.35fr)_minmax(100px,.75fr)_minmax(96px,auto)] gap-3";
}

function toSelectOptions(options: [string, string][]): SelectFieldOption[] {
  return options.map(([value, label]) => ({ label, value }));
}
