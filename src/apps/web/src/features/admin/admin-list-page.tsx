"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Copy, Pencil, Plus, Search, Trash2, UserPlus } from "lucide-react";
import { type FormEvent, type ReactElement, useState } from "react";

import { adminCopy } from "../../copy/admin";
import {
  auditActionLabel,
  documentTitle,
  knowledgeBaseName,
  statusLabel,
  userName,
} from "../mock/selectors";
import { useMockStore } from "../mock/store";
import type {
  MockAuditEvent,
  MockIngestionJob,
  MockProcessingLog,
  MockProviderConfig,
  MockProviderConfigInput,
  MockProviderKind,
  MockRole,
  MockState,
  MockUser,
  MockUserStatus,
} from "../mock/types";
import { Button, ButtonLink } from "../ui/button";
import { DialogFrame } from "../ui/dialog";
import { Drawer } from "../ui/drawer";
import { Notice } from "../ui/notice";
import { Panel, PanelHeader } from "../ui/panel";
import { ScrollArea } from "../ui/scroll-area";
import { SelectField, type SelectFieldOption } from "../ui/select-field";
import { StatusPill } from "../ui/status";
import { ProtectedPage } from "../shell/protected-page";
import {
  detailForRow,
  canRetryIngestionJob,
  parsePositiveInt,
  providerSlotsForState,
  providerKindLabels,
  rowSelectionFromId,
  rowsForKind,
  shouldShowDetailCopyButton,
  targetHrefForAuditEvent,
  type AdminPageKind,
  type AdminRow,
  type ProviderSlot,
} from "./admin-list-helpers";
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

type SelectedRow =
  | { kind: "tasks"; id: string }
  | { kind: "logs"; id: string }
  | { kind: "providers"; id: string }
  | { kind: "users"; id: string }
  | { kind: "audit"; id: string };

export function AdminListPage({ kind }: { kind: AdminPageKind }): ReactElement {
  const { dispatch, state } = useMockStore();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [confirm, setConfirm] = useState<(() => void) | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const search = searchParams.get("search") ?? "";
  const filter = searchParams.get("filter") ?? "all";
  const sort = searchParams.get("sort") ?? "updated";
  const copy = adminCopy[kind];
  const [userDialog, setUserDialog] = useState<MockUser | "create" | null>(null);
  const [providerDialogKind, setProviderDialogKind] = useState<MockProviderKind | null>(null);
  const isAdmin = state.session.role === "admin";
  const selectedRow = rowSelectionFromId(kind, searchParams.get("selectedId"), state);

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

  function selectRow(row: SelectedRow): void {
    const next = new URLSearchParams(searchParams.toString());
    next.set("selectedId", row.id);
    router.replace(`${pathname}?${next.toString()}`);
  }

  function closeDetail(): void {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("selectedId");
    const query = next.toString();
    router.replace(query.length > 0 ? `${pathname}?${query}` : pathname);
  }

  return (
    <ProtectedPage>
      <div className={adminPageGridClassName()}>
        <Panel className={adminListPanelClassName()}>
          <PanelHeader
            action={
              kind === "users" && isAdmin ? (
                <Button onClick={() => setUserDialog("create")} variant="primary">
                  <UserPlus aria-hidden="true" className="h-4 w-4" />
                  {adminCopy.createUser}
                </Button>
              ) : null
            }
            description={copy.description}
            title={copy.title}
          />
          <div className="grid gap-3 border-b border-slate-200 p-4 md:grid-cols-[minmax(0,1fr)_180px_180px]">
            <label className="flex min-h-11 items-center gap-2 rounded-md border border-slate-200 bg-white px-3">
              <Search aria-hidden="true" className="h-4 w-4 text-slate-400" />
              <span className="sr-only">搜索</span>
              <input
                className="min-w-0 flex-1 text-sm outline-none"
                onChange={(event) => updateParam("search", event.target.value)}
                placeholder="搜索当前列表"
                value={search}
              />
            </label>
            <SelectField
              ariaLabel="筛选"
              onChange={(value) => updateParam("filter", value)}
              options={toSelectOptions(filterOptions(kind))}
              value={filter}
            />
            <SelectField
              ariaLabel="排序"
              onChange={(value) => updateParam("sort", value)}
              options={toSelectOptions([["updated", "最近更新"], ["name", "名称"], ["status", "状态"]])}
              value={sort}
            />
          </div>
          {notice === null ? null : (
            <div className="p-4">
              <Notice tone="success">{notice}</Notice>
            </div>
          )}
          <PaginatedRows
            dispatch={dispatch}
            filter={filter}
            kind={kind}
            onConfirm={(callback) => setConfirm(() => callback)}
            isAdmin={isAdmin}
            onNotice={setNotice}
            onSelect={selectRow}
            page={parsePositiveInt(searchParams.get("page"), 1)}
            pageSize={parsePositiveInt(searchParams.get("pageSize"), 8)}
            search={search}
            sort={sort}
            state={state}
            updateParam={updateParam}
            onConfigureProvider={setProviderDialogKind}
            onEditUser={setUserDialog}
          />
        </Panel>

        <DetailDrawer
          onClose={closeDetail}
          onNotice={setNotice}
          selected={selectedRow}
          state={state}
        />
      </div>

      {confirm === null ? null : (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
          role="dialog"
        >
          <section className="w-full max-w-md rounded-md border border-slate-200 bg-white p-4 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-950">确认操作</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{adminCopy.confirmHighImpact}</p>
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
          onNotice={setNotice}
          user={userDialog === "create" ? null : userDialog}
        />
      ) : null}
      {providerDialogKind === null ? null : (
        <ProviderConfigDialog
          kind={providerDialogKind}
          onClose={() => setProviderDialogKind(null)}
          onNotice={setNotice}
          provider={state.providerConfigs.find((item) => item.kind === providerDialogKind) ?? null}
        />
      )}
    </ProtectedPage>
  );
}

function PaginatedRows({
  dispatch,
  filter,
  kind,
  onConfirm,
  isAdmin,
  onNotice,
  onSelect,
  page,
  pageSize,
  search,
  sort,
  state,
  updateParam,
  onConfigureProvider,
  onEditUser,
}: {
  dispatch: ReturnType<typeof useMockStore>["dispatch"];
  filter: string;
  kind: AdminPageKind;
  onConfirm: (callback: () => void) => void;
  isAdmin: boolean;
  onNotice: (notice: string) => void;
  onSelect: (row: SelectedRow) => void;
  page: number;
  pageSize: number;
  search: string;
  sort: string;
  state: MockState;
  updateParam: (key: string, value: string) => void;
  onConfigureProvider: (kind: MockProviderKind) => void;
  onEditUser: (user: MockUser) => void;
}): ReactElement {
  const providerSlots = kind === "providers" ? providerSlotsForState(state, search, filter) : [];
  const rows = kind === "providers" ? providerSlots : rowsForKind(state, kind, search, filter, sort);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visibleRows = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  if (rows.length === 0) {
    return <EmptyState message={adminCopy[kind].empty} />;
  }

  return (
    <>
      <ScrollArea aria-label={`${adminCopy[kind].title}列表`} className={adminListScrollClassName()} size="fill">
        <Rows
          dispatch={dispatch}
          kind={kind}
          onConfirm={onConfirm}
          isAdmin={isAdmin}
          onNotice={onNotice}
          onSelect={onSelect}
          onConfigureProvider={onConfigureProvider}
          onEditUser={onEditUser}
          rows={visibleRows}
          state={state}
        />
      </ScrollArea>
      <Pagination
        currentPage={currentPage}
        pageSize={pageSize}
        total={rows.length}
        totalPages={totalPages}
        updateParam={updateParam}
      />
    </>
  );
}

function Rows({
  dispatch,
  kind,
  onConfirm,
  isAdmin,
  onNotice,
  onSelect,
  rows,
  state,
  onConfigureProvider,
  onEditUser,
}: {
  dispatch: ReturnType<typeof useMockStore>["dispatch"];
  kind: AdminPageKind;
  onConfirm: (callback: () => void) => void;
  isAdmin: boolean;
  onNotice: (notice: string) => void;
  onSelect: (row: SelectedRow) => void;
  rows: AdminRow[] | ProviderSlot[];
  state: MockState;
  onConfigureProvider: (kind: MockProviderKind) => void;
  onEditUser: (user: MockUser) => void;
}): ReactElement {
  if (kind === "tasks") {
    return (
      <div className="divide-y divide-slate-200">
        {(rows as MockIngestionJob[]).map((job) => (
          <TaskRow
            job={job}
            key={job.id}
            onCancel={() =>
              onConfirm(() => {
                dispatch({ jobId: job.id, type: "cancelJob" });
                onNotice("任务已取消。");
              })
            }
            onRetry={() =>
              onConfirm(() => {
                dispatch({ jobId: job.id, type: "retryJob" });
                onNotice("任务已重新加入队列。");
              })
            }
            onSelect={() => onSelect({ id: job.id, kind })}
            adminActionsEnabled={isAdmin}
            state={state}
          />
        ))}
      </div>
    );
  }

  if (kind === "logs") {
    return (
      <div className="divide-y divide-slate-200">
        {(rows as MockProcessingLog[]).map((log) => (
          <LogRow
            key={log.id}
            log={log}
            onCopy={() => copyText(log.requestId, onNotice)}
            onSelect={() => onSelect({ id: log.id, kind })}
            state={state}
          />
        ))}
      </div>
    );
  }

  if (kind === "providers") {
    return (
      <div className="divide-y divide-slate-200">
        {(rows as ProviderSlot[]).map((slot) => (
          <ProviderRow
            dispatch={dispatch}
            key={slot.kind}
            onConfirm={onConfirm}
            onConfigure={() => onConfigureProvider(slot.kind)}
            onEdit={() => onConfigureProvider(slot.kind)}
            onNotice={onNotice}
            onSelect={() => {
              if (slot.provider !== null) {
                onSelect({ id: slot.provider.id, kind });
              }
            }}
            slot={slot}
          />
        ))}
      </div>
    );
  }

  if (kind === "users") {
    return (
      <div className="divide-y divide-slate-200">
        {(rows as MockUser[]).map((user) => (
          <UserRow
            dispatch={dispatch}
            key={user.id}
            onConfirm={onConfirm}
            onEdit={() => onEditUser(user)}
            onNotice={onNotice}
            onSelect={() => onSelect({ id: user.id, kind })}
            user={user}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="divide-y divide-slate-200">
      {(rows as MockAuditEvent[]).map((event) => (
        <AuditRow
          event={event}
          key={event.id}
          onCopy={() => copyText(event.requestId, onNotice)}
          onSelect={() => onSelect({ id: event.id, kind })}
          state={state}
        />
      ))}
    </div>
  );
}

function TaskRow({
  adminActionsEnabled,
  job,
  onCancel,
  onRetry,
  onSelect,
  state,
}: {
  adminActionsEnabled: boolean;
  job: MockIngestionJob;
  onCancel: () => void;
  onRetry: () => void;
  onSelect: () => void;
  state: MockState;
}): ReactElement {
  return (
    <div className={adminRowClassName()}>
      <button className={adminRowPrimaryActionClassName()} onClick={onSelect} type="button">
        <p className="truncate text-sm font-semibold text-slate-950">{documentTitle(state, job.documentId)}</p>
        <p className="mt-1 text-xs text-slate-500">{knowledgeBaseName(state, job.knowledgeBaseId)} · {job.id}</p>
      </button>
      <div className={adminRowSideClassName()}>
        <div className={adminRowMetaClassName()}>
          <StatusPill tone={job.status === "failed" ? "red" : job.status === "succeeded" ? "teal" : "yellow"}>
            {statusLabel(job.status)}
          </StatusPill>
          <span>{job.currentStep}</span>
          <span>{job.attempts}/{job.maxAttempts} 次</span>
        </div>
        <div className={adminRowActionClassName()}>
          <Button
            disabled={!adminActionsEnabled || !canRetryIngestionJob(job)}
            disabledReason={
              adminActionsEnabled ? adminCopy.disabled.retry : adminCopy.disabled.adminTaskAction
            }
            onClick={onRetry}
          >
            重试
          </Button>
          <Button
            disabled={!adminActionsEnabled || (job.status !== "queued" && job.status !== "running")}
            disabledReason={
              adminActionsEnabled ? adminCopy.disabled.cancel : adminCopy.disabled.adminTaskAction
            }
            onClick={onCancel}
            variant="danger"
          >
            取消
          </Button>
        </div>
      </div>
    </div>
  );
}

function LogRow({
  log,
  onCopy,
  onSelect,
  state,
}: {
  log: MockProcessingLog;
  onCopy: () => void;
  onSelect: () => void;
  state: MockState;
}): ReactElement {
  return (
    <div className={adminRowClassName()}>
      <button className={adminRowPrimaryActionClassName()} onClick={onSelect} type="button">
        <p className="truncate text-sm font-semibold text-slate-950">{log.message}</p>
        <p className="mt-1 text-xs text-slate-500">{documentTitle(state, log.documentId)}</p>
      </button>
      <div className={adminRowSideClassName()}>
        <div className={adminRowMetaClassName()}>
          <span>{log.createdAt.slice(0, 10)}</span>
          <StatusPill tone={log.level === "error" ? "red" : log.level === "warning" ? "yellow" : "blue"}>
            {statusLabel(log.level)}
          </StatusPill>
          <span>{log.step}</span>
        </div>
        <div className={adminRowActionClassName()}>
          <Button onClick={onCopy}>
            <Copy aria-hidden="true" className="h-4 w-4" />
            requestId
          </Button>
        </div>
      </div>
    </div>
  );
}

function ProviderRow({
  dispatch,
  onConfirm,
  onConfigure,
  onEdit,
  onNotice,
  onSelect,
  slot,
}: {
  dispatch: ReturnType<typeof useMockStore>["dispatch"];
  onConfirm: (callback: () => void) => void;
  onConfigure: () => void;
  onEdit: () => void;
  onNotice: (notice: string) => void;
  onSelect: () => void;
  slot: ProviderSlot;
}): ReactElement {
  const provider = slot.provider;

  if (provider === null) {
    return (
      <div className={adminRowClassName()}>
        <div className={adminRowPrimaryActionClassName()}>
          <p className="truncate text-sm font-semibold text-slate-950">{slot.label}</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">未配置 · 保存时会自动测试连接</p>
        </div>
        <div className={adminRowSideClassName()}>
          <div className={adminRowMetaClassName()}>
            <span>{slot.kind}</span>
            <StatusPill tone="slate">未配置</StatusPill>
          </div>
          <div className={adminRowActionClassName()}>
            <Button onClick={onConfigure} variant="primary">
              <Plus aria-hidden="true" className="h-4 w-4" />
              配置
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={adminRowClassName()}>
      <button className={adminRowPrimaryActionClassName()} onClick={onSelect} type="button">
        <p className="truncate text-sm font-semibold text-slate-950">{slot.label} · {provider.displayName}</p>
        <p className="mt-1 break-words text-xs leading-5 text-slate-500">
          {provider.provider} · {provider.modelId} · {provider.baseUrl} · {provider.maskedKeySuffix}
        </p>
      </button>
      <div className={adminRowSideClassName()}>
        <div className={adminRowMetaClassName()}>
          <span>{provider.kind}</span>
          <StatusPill tone={provider.status === "enabled" ? "teal" : provider.status === "disabled" ? "slate" : "yellow"}>
            {statusLabel(provider.status)}
          </StatusPill>
          <span>{provider.updatedAt.slice(0, 10)}</span>
        </div>
        <div className={adminRowActionClassName()}>
          <Button onClick={onEdit}>
            <Pencil aria-hidden="true" className="h-4 w-4" />
            编辑
          </Button>
          <Button
            onClick={() => onConfirm(() => {
              dispatch({ providerId: provider.id, type: "deleteProviderConfig" });
              onNotice(`${slot.label}配置已删除。`);
            })}
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

function UserRow({
  dispatch,
  onEdit,
  onConfirm,
  onNotice,
  onSelect,
  user,
}: {
  dispatch: ReturnType<typeof useMockStore>["dispatch"];
  onEdit: () => void;
  onConfirm: (callback: () => void) => void;
  onNotice: (notice: string) => void;
  onSelect: () => void;
  user: MockUser;
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
          <StatusPill tone={user.status === "active" ? "teal" : user.status === "disabled" ? "red" : "yellow"}>
            {statusLabel(user.status)}
          </StatusPill>
        </div>
        <div className={adminRowActionClassName()}>
          <Button onClick={onSelect}>查看</Button>
          <Button onClick={onEdit}>
            <Pencil aria-hidden="true" className="h-4 w-4" />
            编辑
          </Button>
          <Button
            onClick={() => onConfirm(() => {
              const nextStatus = user.status === "disabled" ? "active" : "disabled";
              dispatch({ status: nextStatus, type: "setUserStatus", userId: user.id });
              onNotice(nextStatus === "active" ? "用户访问已启用。" : "用户访问已停用。");
            })}
            variant={user.status === "disabled" ? "secondary" : "danger"}
          >
            {user.status === "disabled" ? "启用" : "停用"}
          </Button>
          <Button
            onClick={() => onConfirm(() => {
              dispatch({ type: "deleteUser", userId: user.id });
              onNotice("用户已删除。");
            })}
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

function AuditRow({
  event,
  onCopy,
  onSelect,
  state,
}: {
  event: MockAuditEvent;
  onCopy: () => void;
  onSelect: () => void;
  state: MockState;
}): ReactElement {
  return (
    <div className={adminRowClassName()}>
      <button className={adminRowPrimaryActionClassName()} onClick={onSelect} type="button">
        <p className="truncate text-sm font-semibold text-slate-950">{auditActionLabel(event.action)}</p>
        <p className="mt-1 text-xs text-slate-500">{userName(state, event.actorId)} · {event.targetId}</p>
      </button>
      <div className={adminRowSideClassName()}>
        <div className={adminRowMetaClassName()}>
          <span>{event.createdAt.slice(0, 10)}</span>
          <span>{event.targetType}</span>
        </div>
        <div className={adminRowActionClassName()}>
          <Button onClick={onCopy}>
            <Copy aria-hidden="true" className="h-4 w-4" />
            requestId
          </Button>
          <TargetLink event={event} />
        </div>
      </div>
    </div>
  );
}

function TargetLink({ event }: { event: MockAuditEvent }): ReactElement {
  const href = targetHrefForAuditEvent(event);

  if (href !== null) {
    return <ButtonLink href={href}>打开目标</ButtonLink>;
  }

  return (
    <Button disabled disabledReason={adminCopy.disabled.openTarget}>
      打开目标
    </Button>
  );
}

function DetailDrawer({
  onClose,
  onNotice,
  selected,
  state,
}: {
  onClose: () => void;
  onNotice: (notice: string) => void;
  selected: SelectedRow | null;
  state: MockState;
}): ReactElement {
  if (selected === null) {
    return (
      <Panel>
        <PanelHeader title="详情" />
        <div className="p-4">
          <Notice>选择一行后查看脱敏详情。</Notice>
        </div>
      </Panel>
    );
  }

  const detail = findDetail(selected, state);
  return (
    <Drawer onClose={onClose} title="详情">
      <div className="space-y-3">
        {detail.map(([label, value]) => (
          <Info key={label} label={label} value={value} />
        ))}
        {shouldShowDetailCopyButton() ? (
          <Button onClick={() => {
            const requestId = detail.find(([label]) => label === "requestId")?.[1] ?? "无 requestId";
            copyText(requestId, onNotice);
          }}>
            <Copy aria-hidden="true" className="h-4 w-4" />
            复制 requestId
          </Button>
        ) : null}
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

function Pagination({
  currentPage,
  pageSize,
  total,
  totalPages,
  updateParam,
}: {
  currentPage: number;
  pageSize: number;
  total: number;
  totalPages: number;
  updateParam: (key: string, value: string) => void;
}): ReactElement {
  return (
    <div className="flex flex-col gap-3 border-t border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-slate-600">
        共 {total} 条 · 第 {currentPage}/{totalPages} 页
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          每页
          <SelectField
            ariaLabel="每页条数"
            className="w-20"
            onChange={(value) => updateParam("pageSize", value)}
            options={toSelectOptions([["5", "5"], ["8", "8"], ["12", "12"]])}
            value={pageSize.toString()}
          />
        </div>
        <Button
          disabled={currentPage <= 1}
          disabledReason="已经是第一页。"
          onClick={() => updateParam("page", (currentPage - 1).toString())}
        >
          上一页
        </Button>
        <Button
          disabled={currentPage >= totalPages}
          disabledReason="已经是最后一页。"
          onClick={() => updateParam("page", (currentPage + 1).toString())}
        >
          下一页
        </Button>
      </div>
    </div>
  );
}

function UserDialog({
  onClose,
  onNotice,
  user,
}: {
  onClose: () => void;
  onNotice: (notice: string) => void;
  user: MockUser | null;
}): ReactElement {
  const { dispatch } = useMockStore();
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [role, setRole] = useState<MockRole>(user?.role ?? "member");
  const [status, setStatus] = useState<MockUserStatus>(user?.status ?? "active");
  const [error, setError] = useState<string | null>(null);
  const isCreateMode = user === null;

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (name.trim().length === 0) {
      setError(adminCopy.validation.nameRequired);
      return;
    }
    if (!email.includes("@")) {
      setError(adminCopy.validation.emailRequired);
      return;
    }

    if (isCreateMode) {
      dispatch({ email: email.trim(), name: name.trim(), role, status, type: "createUser" });
      onNotice("用户已新增。");
    } else if (user !== null) {
      dispatch({
        email: email.trim(),
        name: name.trim(),
        role,
        status,
        type: "updateUser",
        userId: user.id,
      });
      onNotice("用户信息已更新。");
    }
    onClose();
  }

  return (
    <DialogFrame
      description={isCreateMode ? adminCopy.createUserDescription : adminCopy.editUserDescription}
      onClose={onClose}
      onSubmit={handleSubmit}
      title={isCreateMode ? adminCopy.createUser : adminCopy.editUser}
    >
      <div className="space-y-4">
        {error === null ? null : <Notice tone="error">{error}</Notice>}
        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="user-name">
            姓名
          </label>
          <input
            className="mt-2 h-11 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            id="user-name"
            onChange={(event) => setName(event.target.value)}
            value={name}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="user-email">
            邮箱
          </label>
          <input
            className="mt-2 h-11 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            id="user-email"
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            value={email}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="user-role">
            角色
          </label>
          <SelectField
            ariaLabel="角色"
            className="mt-2"
            onChange={(value) => setRole(value as MockRole)}
            options={toSelectOptions([["member", "member"], ["admin", "admin"]])}
            value={role}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="user-status">
            状态
          </label>
          <SelectField
            ariaLabel="用户状态"
            className="mt-2"
            onChange={(value) => setStatus(value as MockUserStatus)}
            options={toSelectOptions([["active", "启用"], ["disabled", "停用"], ["pending", "待确认"]])}
            value={status}
          />
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={onClose}>取消</Button>
          <Button type="submit" variant="primary">
            保存
          </Button>
        </div>
      </div>
    </DialogFrame>
  );
}

function ProviderConfigDialog({
  kind,
  onClose,
  onNotice,
  provider,
}: {
  kind: MockProviderKind;
  onClose: () => void;
  onNotice: (notice: string) => void;
  provider: MockProviderConfig | null;
}): ReactElement {
  const { dispatch } = useMockStore();
  const [displayName, setDisplayName] = useState(provider?.displayName ?? providerKindLabels[kind]);
  const [providerName, setProviderName] = useState(provider?.provider ?? providerNameForKind(kind));
  const [modelId, setModelId] = useState(provider?.modelId ?? "");
  const [baseUrl, setBaseUrl] = useState(provider?.baseUrl ?? "");
  const [apiKey, setApiKey] = useState("");
  const [status, setStatus] = useState<Extract<MockProviderConfigInput["status"], "enabled" | "disabled">>(
    provider?.status === "disabled" ? "disabled" : "enabled",
  );
  const [error, setError] = useState<string | null>(null);
  const title = provider === null ? `配置${providerKindLabels[kind]}` : `编辑${providerKindLabels[kind]}`;

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const validationError = validateProviderForm({
      apiKey,
      baseUrl,
      displayName,
      existingProvider: provider,
      modelId,
      providerName,
    });

    if (validationError !== null) {
      setError(validationError);
      return;
    }

    dispatch({
      provider: {
        apiKey,
        baseUrl: baseUrl.trim(),
        displayName: displayName.trim(),
        ...(provider === null ? {} : { id: provider.id }),
        kind,
        modelId: modelId.trim(),
        provider: providerName.trim(),
        status,
      },
      type: "saveProviderConfig",
    });
    onNotice(`${providerKindLabels[kind]}已保存，并完成连接测试。`);
    onClose();
  }

  return (
    <DialogFrame
      description="保存时会自动执行一次连接测试；API Key 不会回显，留空表示保持原密钥。"
      onClose={onClose}
      onSubmit={handleSubmit}
      title={title}
    >
      <div className="space-y-4">
        {error === null ? null : <Notice tone="error">{error}</Notice>}
        <Info label="模型类型" value={`${providerKindLabels[kind]} · ${kind}`} />
        <FormField label="服务名称" value={displayName} onChange={setDisplayName} />
        <FormField label="Provider" value={providerName} onChange={setProviderName} />
        <FormField label="模型 ID" value={modelId} onChange={setModelId} />
        <FormField label="Base URL" type="url" value={baseUrl} onChange={setBaseUrl} />
        <FormField
          label={provider === null ? "API Key" : "API Key（留空不修改）"}
          type="password"
          value={apiKey}
          onChange={setApiKey}
        />
        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="provider-status">
            状态
          </label>
          <SelectField
            ariaLabel="模型服务状态"
            className="mt-2"
            onChange={(value) => setStatus(value as Extract<MockProviderConfigInput["status"], "enabled" | "disabled">)}
            options={toSelectOptions([["enabled", "启用"], ["disabled", "停用"]])}
            value={status}
          />
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={onClose}>取消</Button>
          <Button type="submit" variant="primary">
            保存并测试
          </Button>
        </div>
      </div>
    </DialogFrame>
  );
}

function FormField({
  label,
  onChange,
  type = "text",
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  type?: "password" | "text" | "url";
  value: string;
}): ReactElement {
  const id = `provider-${slugifyFieldId(label)}`;

  return (
    <div>
      <label className="block text-sm font-medium text-slate-700" htmlFor={id}>
        {label}
      </label>
      <input
        className="mt-2 h-11 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
        id={id}
        onChange={(event) => onChange(event.target.value)}
        type={type}
        value={value}
      />
    </div>
  );
}

function filterOptions(kind: AdminPageKind): [string, string][] {
  if (kind === "tasks") {
    return [["all", "全部状态"], ["queued", "排队中"], ["running", "运行中"], ["failed", "失败"], ["succeeded", "成功"]];
  }
  if (kind === "logs") {
    return [["all", "全部级别"], ["info", "信息"], ["warning", "警告"], ["error", "错误"]];
  }
  if (kind === "providers") {
    return [["all", "全部状态"], ["enabled", "启用"], ["disabled", "停用"], ["missing", "未配置"]];
  }
  if (kind === "users") {
    return [["all", "全部角色"], ["admin", "admin"], ["member", "member"]];
  }
  return [
    ["all", "全部动作"],
    ["provider.create", "新增模型服务"],
    ["provider.update", "编辑模型服务"],
    ["provider.delete", "删除模型服务"],
    ["provider.test_connection", "测试模型服务连接"],
    ["provider.enable", "启用模型服务"],
    ["provider.disable", "停用模型服务"],
    ["user.create", "新增用户"],
    ["user.update", "编辑用户"],
    ["user.delete", "删除用户"],
    ["user.enable", "启用用户"],
    ["user.disable", "停用用户"],
    ["document.import", "导入文档"],
    ["chat.feedback.submit", "反馈"],
  ];
}

function toSelectOptions(options: [string, string][]): SelectFieldOption[] {
  return options.map(([value, label]) => ({ label, value }));
}

function findDetail(selected: SelectedRow, state: MockState): [string, string][] {
  return detailForRow(selected, state);
}

function copyText(value: string, onNotice: (notice: string) => void): void {
  if (typeof navigator !== "undefined" && navigator.clipboard !== undefined) {
    navigator.clipboard
      .writeText(value)
      .then(() => onNotice("已复制。"))
      .catch(() => onNotice("复制失败，请重试。"));
    return;
  }

  onNotice("当前浏览器不支持复制，请手动选中内容。");
}

function providerNameForKind(kind: MockProviderKind): string {
  if (kind === "rerank") {
    return "Cohere Compatible";
  }

  return "OpenAI Compatible";
}

function validateProviderForm(input: {
  apiKey: string;
  baseUrl: string;
  displayName: string;
  existingProvider: MockProviderConfig | null;
  modelId: string;
  providerName: string;
}): string | null {
  if (input.displayName.trim().length === 0) {
    return "请输入服务名称。";
  }
  if (input.providerName.trim().length === 0) {
    return "请输入 Provider。";
  }
  if (input.modelId.trim().length === 0) {
    return "请输入模型 ID。";
  }
  if (!isValidHttpUrl(input.baseUrl.trim())) {
    return "请输入有效的 Base URL。";
  }
  if (input.existingProvider === null && input.apiKey.trim().length === 0) {
    return "新增模型服务必须输入 API Key。";
  }

  return null;
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function slugifyFieldId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "field";
}
