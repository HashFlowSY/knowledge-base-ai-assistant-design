"use client";

import { FileUp, Globe2, Pencil, Plus, Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type ReactElement, type UIEvent } from "react";

import {
  knowledgeBaseListQuerySchema,
  type KnowledgeBaseDetail,
  type KnowledgeBaseMemberSummary,
  type KnowledgeBaseSummary,
} from "@kb/knowledge";
import type { UserSummary } from "@kb/users";

import { knowledgeCopy } from "../../copy/knowledge";
import { useSessionQuery } from "../auth/auth-hooks";
import { useUsers } from "../admin/user-hooks";
import { ApiClientError } from "../api/client";
import { useCreateKnowledgeBase, useInfiniteKnowledgeBases, useKnowledgeBase, useUpdateKnowledgeBase } from "../knowledge/knowledge-hooks";
import { ProtectedPage } from "../shell/protected-page";
import { Button, ButtonLink } from "../ui/button";
import { DialogFrame } from "../ui/dialog";
import type { FormSubmitHandler } from "../ui/form-types";
import { Notice } from "../ui/notice";
import { Panel, PanelHeader } from "../ui/panel";
import { ScrollArea } from "../ui/scroll-area";
import {
  workspaceContentClassName,
  workspaceKnowledgeListClassName,
  workspaceKnowledgePanelClassName,
  workspaceMetricGridClassName,
  workspaceMetricTileClassName,
  workspacePageGridClassName,
  workspaceSummaryEmptyClassName,
  workspaceSummaryGridClassName,
  workspaceSummaryListClassName,
} from "./workspace-layout";

type DialogState =
  | { mode: "create" }
  | { knowledgeBaseId: string; mode: "edit" }
  | null;

interface MemberOption {
  email: string;
  id: string;
  name: string;
}

const knowledgeBaseListPageSize = 8;

export function WorkspaceMvpPage(): ReactElement {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const sessionQuery = useSessionQuery();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const query = knowledgeBaseListQuerySchema.parse(Object.fromEntries(searchParams));
  const knowledgeBaseIdFromUrl = normalizeSearchParam(searchParams.get("knowledgeBaseId"));
  const knowledgeBaseListQuery = useMemo(
    () => ({
      pageSize: knowledgeBaseListPageSize,
      sort: "updated" as const,
      ...(query.search === undefined ? {} : { search: query.search }),
    }),
    [query.search],
  );
  const knowledgeBasesQuery = useInfiniteKnowledgeBases(knowledgeBaseListQuery);
  const knowledgeBaseItems = useMemo(
    () => dedupeKnowledgeBases(knowledgeBasesQuery.data?.pages.flatMap((page) => page.items) ?? []),
    [knowledgeBasesQuery.data?.pages],
  );
  const selectedKnowledgeBaseId = knowledgeBaseIdFromUrl ?? knowledgeBaseItems[0]?.id ?? null;
  const selectedKnowledgeBaseQuery = useKnowledgeBase(selectedKnowledgeBaseId);
  const isAdmin = sessionQuery.data?.role === "admin";
  const showProcessingLogs = isAdmin;

  useEffect(() => {
    if (knowledgeBaseIdFromUrl === null && knowledgeBaseItems[0] !== undefined) {
      updateQueryParam({
        key: "knowledgeBaseId",
        pathname,
        router,
        searchParams,
        value: knowledgeBaseItems[0].id,
      });
    }
  }, [knowledgeBaseIdFromUrl, knowledgeBaseItems, pathname, router, searchParams]);

  function updateParam(key: string, value: string): void {
    updateQueryParam({ key, pathname, router, searchParams, value });
  }

  function selectKnowledgeBase(knowledgeBaseId: string): void {
    updateParam("knowledgeBaseId", knowledgeBaseId);
  }

  function fetchNextKnowledgeBasePage(): void {
    if (knowledgeBasesQuery.hasNextPage === true && !knowledgeBasesQuery.isFetchingNextPage) {
      void knowledgeBasesQuery.fetchNextPage();
    }
  }

  function handleKnowledgeBaseListScroll(event: UIEvent<HTMLDivElement>): void {
    const { clientHeight, scrollHeight, scrollTop } = event.currentTarget;
    const distanceToBottom = scrollHeight - scrollTop - clientHeight;

    if (distanceToBottom <= 96) {
      fetchNextKnowledgeBasePage();
    }
  }

  return (
    <ProtectedPage>
      <div className={workspacePageGridClassName()}>
        <Panel className={workspaceKnowledgePanelClassName()}>
          <PanelHeader description={knowledgeCopy.listDescription} title={knowledgeCopy.listTitle} />
          <div className="border-b border-slate-200 p-4">
            <label className="flex min-h-11 items-center gap-2 rounded-md border border-slate-200 bg-white px-3">
              <Search aria-hidden="true" className="h-4 w-4 text-slate-400" />
              <span className="sr-only">{knowledgeCopy.searchLabel}</span>
              <input
                aria-label={knowledgeCopy.searchLabel}
                className="min-w-0 flex-1 text-sm outline-none"
                onChange={(event) => updateParam("search", event.target.value)}
                placeholder={knowledgeCopy.searchPlaceholder}
                value={query.search ?? ""}
              />
            </label>
          </div>
          {notice === null ? null : (
            <div className="border-b border-slate-200 p-4">
              <Notice tone="success">{notice}</Notice>
            </div>
          )}
          {knowledgeBasesQuery.isError ? (
            <QueryErrorState
              actionLabel={knowledgeCopy.retry}
              message={knowledgeCopy.errors.knowledgeBaseList}
              onRetry={() => knowledgeBasesQuery.refetch()}
            />
          ) : knowledgeBasesQuery.isLoading && knowledgeBasesQuery.data === undefined ? (
            <div className="p-4">
              <Notice>{knowledgeCopy.pending.knowledgeBaseList}</Notice>
            </div>
          ) : knowledgeBaseItems.length === 0 ? (
            <div className="p-4">
              <Notice>{query.search === undefined ? knowledgeCopy.empty.knowledgeBaseList : knowledgeCopy.empty.searchResult}</Notice>
            </div>
          ) : (
            <ScrollArea
              aria-label={knowledgeCopy.listTitle}
              className={workspaceKnowledgeListClassName()}
              onScroll={handleKnowledgeBaseListScroll}
              size="fill"
            >
              <div className="divide-y divide-slate-200">
                {knowledgeBaseItems.map((item) => (
                  <KnowledgeBaseRow
                    active={item.id === selectedKnowledgeBaseId}
                    item={item}
                    key={item.id}
                    onSelect={() => selectKnowledgeBase(item.id)}
                  />
                ))}
              </div>
              {knowledgeBasesQuery.isFetchingNextPage ? (
                <div className="p-4">
                  <Notice>{knowledgeCopy.pending.moreKnowledgeBases}</Notice>
                </div>
              ) : knowledgeBasesQuery.hasNextPage === true ? (
                <p className="px-4 py-3 text-xs text-slate-500">{knowledgeCopy.listScrollHint}</p>
              ) : null}
            </ScrollArea>
          )}
        </Panel>

        <section className={workspaceContentClassName()}>
          <Panel className="overflow-hidden">
            <PanelHeader
              action={
                <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
                  {isAdmin ? (
                    <Button onClick={() => setDialog({ mode: "create" })} variant="secondary">
                      <Plus aria-hidden="true" className="h-4 w-4" />
                      {knowledgeCopy.createKnowledgeBase}
                    </Button>
                  ) : null}
                  {isAdmin && selectedKnowledgeBaseId !== null ? (
                    <Button onClick={() => setDialog({ knowledgeBaseId: selectedKnowledgeBaseId, mode: "edit" })}>
                      <Pencil aria-hidden="true" className="h-4 w-4" />
                      {knowledgeCopy.editKnowledgeBase}
                    </Button>
                  ) : null}
                  <Button
                    disabled={true}
                    disabledReason={knowledgeCopy.disabled.uploadPending}
                    variant="primary"
                  >
                    <FileUp aria-hidden="true" className="h-4 w-4" />
                    {knowledgeCopy.uploadFile}
                  </Button>
                  <Button
                    disabled={true}
                    disabledReason={knowledgeCopy.disabled.importPending}
                    variant="secondary"
                  >
                    <Globe2 aria-hidden="true" className="h-4 w-4" />
                    {knowledgeCopy.importUrl}
                  </Button>
                </div>
              }
              description={knowledgeCopy.workspaceDescription}
              title={knowledgeCopy.workspaceTitle}
            />
            {selectedKnowledgeBaseId === null ? (
              <div className="p-4">
                <Notice>{knowledgeCopy.empty.noKnowledgeBaseSelected}</Notice>
              </div>
            ) : selectedKnowledgeBaseQuery.isError ? (
              <QueryErrorState
                actionLabel={knowledgeCopy.retry}
                message={knowledgeCopy.errors.knowledgeBaseDetail}
                onRetry={() => selectedKnowledgeBaseQuery.refetch()}
              />
            ) : selectedKnowledgeBaseQuery.isLoading && selectedKnowledgeBaseQuery.data === undefined ? (
              <div className="p-4">
                <Notice>{knowledgeCopy.pending.knowledgeBaseDetail}</Notice>
              </div>
            ) : selectedKnowledgeBaseQuery.data !== undefined ? (
              <KnowledgeBaseSummaryPanel knowledgeBase={selectedKnowledgeBaseQuery.data} />
            ) : (
              <div className="p-4">
                <Notice>{knowledgeCopy.empty.noKnowledgeBaseSelected}</Notice>
              </div>
            )}
          </Panel>

          <div className={workspaceSummaryGridClassName(showProcessingLogs)}>
            <PendingSummaryPanel
              action={selectedKnowledgeBaseId === null ? null : <ButtonLink href="/chat" variant="primary">{knowledgeCopy.openChat}</ButtonLink>}
              message={knowledgeCopy.empty.documentsPending}
              title={knowledgeCopy.documentsTitle}
            />
            <PendingSummaryPanel
              message={knowledgeCopy.empty.tasksPending}
              title={knowledgeCopy.recentTasks}
            />
            {showProcessingLogs ? (
              <PendingSummaryPanel
                message={knowledgeCopy.empty.logsPending}
                title={knowledgeCopy.recentLogs}
              />
            ) : null}
          </div>
        </section>
      </div>

      {dialog === null ? null : (
        <KnowledgeBaseDialog
          knowledgeBaseId={dialog.mode === "edit" ? dialog.knowledgeBaseId : null}
          mode={dialog.mode}
          onClose={() => setDialog(null)}
          onNotice={setNotice}
          onSelectKnowledgeBase={selectKnowledgeBase}
        />
      )}
    </ProtectedPage>
  );
}

function KnowledgeBaseRow({
  active,
  item,
  onSelect,
}: {
  active: boolean;
  item: KnowledgeBaseSummary;
  onSelect: () => void;
}): ReactElement {
  return (
    <button
      aria-pressed={active}
      className={`block min-h-11 w-full px-4 py-3 text-left transition hover:bg-slate-50 ${active ? "bg-teal-50" : "bg-white"}`}
      onClick={onSelect}
      type="button"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-950">{item.name}</p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
            {item.description ?? knowledgeCopy.labels.noDescription}
          </p>
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        {knowledgeCopy.labels.documentCountValue(item.documentCount)} · {knowledgeCopy.labels.memberCountValue(item.memberCount)}
      </p>
      <p className="mt-1 text-xs text-slate-500">{formatMemberSummary(item.members, item.memberCount)}</p>
    </button>
  );
}

function KnowledgeBaseSummaryPanel({
  knowledgeBase,
}: {
  knowledgeBase: KnowledgeBaseDetail;
}): ReactElement {
  return (
    <div className="p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold text-slate-950">{knowledgeBase.name}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            {knowledgeBase.description ?? knowledgeCopy.labels.noDescription}
          </p>
        </div>
        <div className="shrink-0">
          <ButtonLink href="/chat" variant="primary">
            {knowledgeCopy.openChat}
          </ButtonLink>
        </div>
      </div>
      <div className={workspaceMetricGridClassName()}>
        <Metric label={knowledgeCopy.labels.documentCount} value={knowledgeBase.documentCount.toString()} />
        <Metric label={knowledgeCopy.labels.memberCount} value={knowledgeBase.memberCount.toString()} />
        <Metric label={knowledgeCopy.labels.createdAt} value={formatTimestamp(knowledgeBase.createdAt)} />
      </div>
      <div className="mt-4 space-y-2">
        <p className="text-xs font-medium text-slate-500">{knowledgeCopy.members.searchLabel}</p>
        <p className="text-sm text-slate-600">{formatMemberSummary(knowledgeBase.members, knowledgeBase.memberCount)}</p>
        {knowledgeBase.members.length === 0 ? null : (
          <ul className="space-y-2">
            {knowledgeBase.members.map((member) => (
              <li className="rounded-md border border-slate-200 px-3 py-2" key={member.id}>
                <p className="text-sm font-medium text-slate-950">{member.name}</p>
                <p className="mt-1 text-xs text-slate-500">{member.email}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function PendingSummaryPanel({
  action,
  message,
  title,
}: {
  action?: ReactElement | null;
  message: string;
  title: string;
}): ReactElement {
  return (
    <Panel>
      <PanelHeader action={action ?? undefined} title={title} />
      <ScrollArea aria-label={title} className={workspaceSummaryListClassName()} size="lg">
        <WorkspaceSummaryEmptyState message={message} />
      </ScrollArea>
    </Panel>
  );
}

function WorkspaceSummaryEmptyState({ message }: { message: string }): ReactElement {
  return (
    <div className={workspaceSummaryEmptyClassName()}>
      <Notice>{message}</Notice>
    </div>
  );
}

function KnowledgeBaseDialog({
  knowledgeBaseId,
  mode,
  onClose,
  onNotice,
  onSelectKnowledgeBase,
}: {
  knowledgeBaseId: string | null;
  mode: "create" | "edit";
  onClose: () => void;
  onNotice: (notice: string) => void;
  onSelectKnowledgeBase: (knowledgeBaseId: string) => void;
}): ReactElement {
  const editDetailQuery = useKnowledgeBase(mode === "edit" ? knowledgeBaseId : null);
  const createKnowledgeBase = useCreateKnowledgeBase();
  const updateKnowledgeBase = useUpdateKnowledgeBase(knowledgeBaseId);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<MemberOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(mode === "create");
  const memberQueryInput = useMemo(
    () => ({
      filter: "member" as const,
      page: 1,
      pageSize: 8,
      sort: "name" as const,
      ...(memberSearch.trim().length === 0 ? {} : { search: memberSearch.trim() }),
    }),
    [memberSearch],
  );
  const memberQuery = useUsers({
    ...memberQueryInput,
  });

  useEffect(() => {
    if (mode !== "edit" || editDetailQuery.data === undefined || initialized) {
      return;
    }

    setName(editDetailQuery.data.name);
    setDescription(editDetailQuery.data.description ?? "");
    setSelectedMembers(editDetailQuery.data.members.map(toMemberOption));
    setInitialized(true);
  }, [editDetailQuery.data, initialized, mode]);

  const pending = createKnowledgeBase.isPending || updateKnowledgeBase.isPending;
  const formDisabled = pending || (mode === "edit" && !initialized);
  const visibleMembers = useMemo(() => {
    const knownMembers = new Map<string, MemberOption>();

    for (const member of selectedMembers) {
      knownMembers.set(member.id, member);
    }

    for (const member of editDetailQuery.data?.members ?? []) {
      knownMembers.set(member.id, toMemberOption(member));
    }

    for (const member of memberQuery.data?.items ?? []) {
      knownMembers.set(member.id, toMemberOption(member));
    }

    return Array.from(knownMembers.values()).sort((left, right) =>
      left.name.localeCompare(right.name, "zh-CN"),
    );
  }, [editDetailQuery.data?.members, memberQuery.data?.items, selectedMembers]);

  const handleSubmit: FormSubmitHandler = async (event) => {
    event.preventDefault();
    setError(null);

    if (name.trim().length === 0) {
      setError(knowledgeCopy.validation.nameRequired);
      return;
    }

    try {
      const payload = {
        description,
        memberIds: selectedMembers.map((member) => member.id),
        name,
      };

      if (mode === "create") {
        const created = await createKnowledgeBase.mutateAsync(payload);
        onNotice(knowledgeCopy.success.created);
        onSelectKnowledgeBase(created.id);
      } else {
        const updated = await updateKnowledgeBase.mutateAsync(payload);
        onNotice(knowledgeCopy.success.updated);
        onSelectKnowledgeBase(updated.id);
      }
      onClose();
    } catch (caught) {
      setError(toKnowledgeBaseErrorCopy(caught));
    }
  };

  return (
    <DialogFrame
      description={mode === "create" ? knowledgeCopy.createKnowledgeBaseDescription : knowledgeCopy.editKnowledgeBaseDescription}
      onClose={onClose}
      onSubmit={handleSubmit}
      title={mode === "create" ? knowledgeCopy.createKnowledgeBase : knowledgeCopy.editKnowledgeBase}
    >
      <div className="space-y-4">
        {error === null ? null : <Notice tone="error">{error}</Notice>}
        {mode === "edit" && editDetailQuery.isError ? (
          <Notice tone="error">{knowledgeCopy.errors.knowledgeBaseDetail}</Notice>
        ) : null}
        {mode === "edit" && !initialized ? (
          <Notice>{knowledgeCopy.pending.knowledgeBaseDetail}</Notice>
        ) : null}
        <TextField
          disabled={formDisabled}
          id="knowledge-base-name"
          label={knowledgeCopy.labels.name}
          onChange={setName}
          value={name}
        />
        <TextAreaField
          disabled={formDisabled}
          id="knowledge-base-description"
          label={knowledgeCopy.labels.description}
          onChange={setDescription}
          value={description}
        />
        <MemberPicker
          disabled={formDisabled}
          members={visibleMembers}
          pending={memberQuery.isLoading}
          search={memberSearch}
          searchError={memberQuery.isError ? knowledgeCopy.errors.memberList : null}
          selectedMemberIds={new Set(selectedMembers.map((member) => member.id))}
          setSearch={setMemberSearch}
          toggleMember={(member) => {
            setSelectedMembers((current) =>
              current.some((item) => item.id === member.id)
                ? current.filter((item) => item.id !== member.id)
                : [...current, member],
            );
          }}
        />
        <div className="flex flex-wrap justify-end gap-2">
          <Button disabled={pending} disabledReason={knowledgeCopy.pending.savingKnowledgeBase} onClick={onClose}>
            {knowledgeCopy.cancel}
          </Button>
          <Button
            disabled={pending || (mode === "edit" && !initialized)}
            disabledReason={knowledgeCopy.pending.savingKnowledgeBase}
            type="submit"
            variant="primary"
          >
            {knowledgeCopy.save}
          </Button>
        </div>
      </div>
    </DialogFrame>
  );
}

function MemberPicker({
  disabled,
  members,
  pending,
  search,
  searchError,
  selectedMemberIds,
  setSearch,
  toggleMember,
}: {
  disabled: boolean;
  members: MemberOption[];
  pending: boolean;
  search: string;
  searchError: string | null;
  selectedMemberIds: Set<string>;
  setSearch: (value: string) => void;
  toggleMember: (member: MemberOption) => void;
}): ReactElement {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-slate-700" htmlFor="knowledge-base-members">
          {knowledgeCopy.members.searchLabel}
        </label>
        <p className="mt-1 text-xs leading-5 text-slate-500">{knowledgeCopy.members.description}</p>
        <div className="mt-2 flex min-h-11 items-center gap-2 rounded-md border border-slate-200 bg-white px-3">
          <Search aria-hidden="true" className="h-4 w-4 text-slate-400" />
          <input
            className="min-w-0 flex-1 text-sm outline-none"
            disabled={disabled}
            id="knowledge-base-members"
            onChange={(event) => setSearch(event.target.value)}
            placeholder={knowledgeCopy.members.searchPlaceholder}
            value={search}
          />
        </div>
      </div>
      {pending ? <Notice>{knowledgeCopy.pending.memberList}</Notice> : null}
      {searchError === null ? null : <Notice tone="error">{searchError}</Notice>}
      <div className="space-y-2 rounded-md border border-slate-200 p-3">
        <p className="text-xs font-medium text-slate-500">{knowledgeCopy.members.selectionLabel}</p>
        {members.length === 0 ? (
          <p className="text-sm text-slate-600">{knowledgeCopy.members.empty}</p>
        ) : (
          members.map((member) => {
            const checked = selectedMemberIds.has(member.id);

            return (
              <label
                className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md border border-slate-200 px-3 py-2 hover:bg-slate-50"
                htmlFor={`member-${member.id}`}
                key={member.id}
              >
                <input
                  checked={checked}
                  className="mt-1 h-4 w-4"
                  disabled={disabled}
                  id={`member-${member.id}`}
                  onChange={() => toggleMember(member)}
                  type="checkbox"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-slate-950">{member.name}</span>
                  <span className="mt-1 block text-xs text-slate-500">{member.email}</span>
                </span>
              </label>
            );
          })
        )}
      </div>
    </div>
  );
}

function TextField({
  disabled,
  id,
  label,
  onChange,
  value,
}: {
  disabled: boolean;
  id: string;
  label: string;
  onChange: (value: string) => void;
  value: string;
}): ReactElement {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700" htmlFor={id}>
        {label}
      </label>
      <input
        className="mt-2 h-11 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
        disabled={disabled}
        id={id}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </div>
  );
}

function TextAreaField({
  disabled,
  id,
  label,
  onChange,
  value,
}: {
  disabled: boolean;
  id: string;
  label: string;
  onChange: (value: string) => void;
  value: string;
}): ReactElement {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700" htmlFor={id}>
        {label}
      </label>
      <textarea
        className="mt-2 min-h-28 w-full rounded-md border border-slate-200 px-3 py-3 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
        disabled={disabled}
        id={id}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className={workspaceMetricTileClassName()}>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function QueryErrorState({
  actionLabel,
  message,
  onRetry,
}: {
  actionLabel: string;
  message: string;
  onRetry: () => Promise<unknown>;
}): ReactElement {
  return (
    <div className="space-y-3 p-4">
      <Notice tone="error">{message}</Notice>
      <Button onClick={() => void onRetry()}>{actionLabel}</Button>
    </div>
  );
}

function formatMemberSummary(
  members: KnowledgeBaseMemberSummary[],
  memberCount: number,
): string {
  if (memberCount === 0) {
    return knowledgeCopy.members.empty;
  }

  const names = members.slice(0, 2).map((member) => member.name);
  if (memberCount <= names.length) {
    return names.join("、");
  }

  return `${names.join("、")}等 ${memberCount} 人`;
}

function dedupeKnowledgeBases(items: KnowledgeBaseSummary[]): KnowledgeBaseSummary[] {
  const byId = new Map<string, KnowledgeBaseSummary>();

  for (const item of items) {
    byId.set(item.id, item);
  }

  return Array.from(byId.values());
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function normalizeSearchParam(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function updateQueryParam({
  key,
  pathname,
  router,
  searchParams,
  value,
}: {
  key: string;
  pathname: string;
  router: ReturnType<typeof useRouter>;
  searchParams: ReturnType<typeof useSearchParams>;
  value: string;
}): void {
  const next = new URLSearchParams(searchParams.toString());

  if (value === "") {
    next.delete(key);
  } else {
    next.set(key, value);
  }

  if (key === "search") {
    next.delete("page");
    next.delete("pageSize");
    next.delete("sort");
  }

  const queryString = next.toString();
  router.replace(queryString.length > 0 ? `${pathname}?${queryString}` : pathname);
}

function toMemberOption(member: KnowledgeBaseMemberSummary | UserSummary): MemberOption {
  return {
    email: member.email,
    id: member.id,
    name: member.name,
  };
}

function toKnowledgeBaseErrorCopy(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.response.code === "CONFLICT" || error.response.httpStatus === 409) {
      return knowledgeCopy.errors.duplicateKnowledgeBase;
    }

    return error.response.message;
  }

  return knowledgeCopy.errors.saveKnowledgeBase;
}
