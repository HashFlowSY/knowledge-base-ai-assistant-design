"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FileUp, Globe2, Plus, Search } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent, type ReactElement } from "react";

import { knowledgeCopy } from "../../copy/knowledge";
import { useMockStore } from "../mock/store";
import type { MockDocument, MockKnowledgeBase } from "../mock/types";
import { knowledgeBaseName, sourceTypeLabel, statusLabel } from "../mock/selectors";
import { Button, ButtonLink } from "../ui/button";
import { DialogFrame } from "../ui/dialog";
import { Notice } from "../ui/notice";
import { Panel, PanelHeader } from "../ui/panel";
import { ScrollArea } from "../ui/scroll-area";
import { StatusPill } from "../ui/status";
import { ProtectedPage } from "../shell/protected-page";
import {
  shouldShowKnowledgeBaseListStatus,
  workspaceKnowledgeListClassName,
  workspaceKnowledgePanelClassName,
  workspaceContentClassName,
  workspaceLogSummaryHref,
  workspaceMetricGridClassName,
  workspaceMetricTileClassName,
  workspacePageGridClassName,
  workspaceSummaryEmptyClassName,
  workspaceSummaryGridClassName,
  workspaceSummaryListClassName,
  workspaceSummaryListItemClassName,
  workspaceTaskSummaryHref,
  workspaceVisibleDocuments,
  workspaceVisibleJobs,
  workspaceVisibleLogs,
} from "./workspace-layout";
import { canShowWorkspaceProcessingLogs } from "./workspace-permissions";

type DialogKind = "create" | "upload" | "url" | null;

export function WorkspaceMvpPage(): ReactElement {
  const { dispatch, state } = useMockStore();
  const canCreateKnowledgeBase = state.session.role === "admin";
  const canShowProcessingLogs = canShowWorkspaceProcessingLogs(state.session.role);
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogKind>(null);
  const search = searchParams.get("search") ?? "";
  const knowledgeBaseIdFromUrl = searchParams.get("knowledgeBaseId");
  const selectedKnowledgeBase =
    state.knowledgeBases.find((item) => item.id === knowledgeBaseIdFromUrl) ??
    state.knowledgeBases.find((item) => item.id === state.selectedKnowledgeBaseId) ??
    state.knowledgeBases[0];
  const filteredKnowledgeBases = state.knowledgeBases.filter((item) =>
    `${item.name} ${item.description}`.toLowerCase().includes(search.toLowerCase()),
  );
  const documents = selectedKnowledgeBase
    ? state.documents.filter((item) => item.knowledgeBaseId === selectedKnowledgeBase.id)
    : [];
  const jobs = selectedKnowledgeBase
    ? state.jobs.filter((item) => item.knowledgeBaseId === selectedKnowledgeBase.id)
    : [];
  const logs = selectedKnowledgeBase
    ? state.logs.filter((item) => item.knowledgeBaseId === selectedKnowledgeBase.id)
    : [];

  useEffect(() => {
    if (selectedKnowledgeBase !== undefined && selectedKnowledgeBase.id !== state.selectedKnowledgeBaseId) {
      dispatch({ knowledgeBaseId: selectedKnowledgeBase.id, type: "selectKnowledgeBase" });
    }
  }, [dispatch, selectedKnowledgeBase, state.selectedKnowledgeBaseId]);

  function updateParam(key: string, value: string): void {
    const next = new URLSearchParams(searchParams.toString());
    if (value === "") {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    router.replace(`${pathname}?${next.toString()}`);
  }

  function selectKnowledgeBase(knowledgeBaseId: string): void {
    dispatch({ knowledgeBaseId, type: "selectKnowledgeBase" });
    updateParam("knowledgeBaseId", knowledgeBaseId);
  }

  return (
    <ProtectedPage>
      <div className={workspacePageGridClassName()}>
        <Panel className={workspaceKnowledgePanelClassName()}>
          <PanelHeader title="知识库">
            <div className="mt-3 flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3">
              <Search aria-hidden="true" className="h-4 w-4 text-slate-400" />
              <input
                aria-label="搜索知识库"
                className="h-11 min-w-0 flex-1 text-sm outline-none"
                onChange={(event) => updateParam("search", event.target.value)}
                placeholder="按名称或描述搜索"
                value={search}
              />
            </div>
          </PanelHeader>
          <ScrollArea aria-label="知识库列表" className={workspaceKnowledgeListClassName()} size="fill">
            {filteredKnowledgeBases.length === 0 ? (
              <div className="p-4">
                <Notice>暂无匹配知识库。</Notice>
              </div>
            ) : (
              filteredKnowledgeBases.map((item) => (
                <KnowledgeBaseRow
                  active={item.id === selectedKnowledgeBase?.id}
                  item={item}
                  key={item.id}
                  onSelect={() => selectKnowledgeBase(item.id)}
                />
              ))
            )}
          </ScrollArea>
        </Panel>

        <section className={workspaceContentClassName()}>
          <Panel className="overflow-hidden">
            <PanelHeader
              action={
                <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
                  <Button
                    disabled={!canCreateKnowledgeBase}
                    disabledReason={knowledgeCopy.disabled.createKnowledgeBase}
                    onClick={() => setDialog("create")}
                    variant="secondary"
                  >
                    <Plus aria-hidden="true" className="h-4 w-4" />
                    {knowledgeCopy.createKnowledgeBase}
                  </Button>
                  <Button
                    disabled={selectedKnowledgeBase === undefined}
                    disabledReason={knowledgeCopy.disabled.upload}
                    onClick={() => setDialog("upload")}
                    variant="primary"
                  >
                    <FileUp aria-hidden="true" className="h-4 w-4" />
                    {knowledgeCopy.uploadFile}
                  </Button>
                  <Button
                    disabled={selectedKnowledgeBase === undefined}
                    disabledReason={knowledgeCopy.disabled.importUrl}
                    onClick={() => setDialog("url")}
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
            {selectedKnowledgeBase === undefined ? (
              <div className="p-4">
                <Notice>暂无知识库，请先新建知识库。</Notice>
              </div>
            ) : (
              <KnowledgeBaseSummary
                documents={documents}
                jobsCount={jobs.length}
                knowledgeBase={selectedKnowledgeBase}
              />
            )}
          </Panel>

          <div className={workspaceSummaryGridClassName(canShowProcessingLogs)}>
            <DocumentPanel documents={documents} state={state} />
            <TaskSummary jobs={jobs} />
            {canShowProcessingLogs ? <LogSummary logs={logs} /> : null}
          </div>
        </section>
      </div>

      {dialog === "create" && canCreateKnowledgeBase ? (
        <CreateKnowledgeDialog onClose={() => setDialog(null)} />
      ) : null}
      {dialog === "upload" && selectedKnowledgeBase !== undefined ? (
        <UploadDialog knowledgeBase={selectedKnowledgeBase} onClose={() => setDialog(null)} />
      ) : null}
      {dialog === "url" && selectedKnowledgeBase !== undefined ? (
        <UrlDialog knowledgeBase={selectedKnowledgeBase} onClose={() => setDialog(null)} />
      ) : null}
    </ProtectedPage>
  );
}

function KnowledgeBaseRow({
  active,
  item,
  onSelect,
}: {
  active: boolean;
  item: MockKnowledgeBase;
  onSelect: () => void;
}): ReactElement {
  return (
    <button
      aria-pressed={active}
      className={`block min-h-11 w-full px-4 py-3 text-left transition hover:bg-slate-50 ${
        active ? "bg-teal-50" : "bg-white"
      }`}
      onClick={onSelect}
      type="button"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-950">{item.name}</p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{item.description}</p>
        </div>
        {shouldShowKnowledgeBaseListStatus(item.status) ? (
          <StatusPill tone={item.status === "failed" ? "red" : "yellow"}>
            {statusLabel(item.status)}
          </StatusPill>
        ) : null}
      </div>
      <p className="mt-2 text-xs text-slate-500">{item.documentIds.length} 个文档 · {item.owner}</p>
    </button>
  );
}

function KnowledgeBaseSummary({
  documents,
  jobsCount,
  knowledgeBase,
}: {
  documents: MockDocument[];
  jobsCount: number;
  knowledgeBase: MockKnowledgeBase;
}): ReactElement {
  const readyCount = documents.filter((item) => item.status === "ready").length;
  const failedCount = documents.filter((item) => item.status === "failed").length;
  const processingCount = documents.filter((item) => item.status === "processing").length;

  return (
    <div className="p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold text-slate-950">{knowledgeBase.name}</h2>
            <StatusPill tone={knowledgeBase.status === "ready" ? "teal" : "yellow"}>
              {statusLabel(knowledgeBase.status)}
            </StatusPill>
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            {knowledgeBase.description}
          </p>
        </div>
        <div className="shrink-0">
          <ButtonLink href="/chat" variant="primary">
            进入问答
          </ButtonLink>
        </div>
      </div>
      <div className={workspaceMetricGridClassName()}>
        <Metric label="文档" value={documents.length.toString()} />
        <Metric label="可用于问答" value={readyCount.toString()} />
        <Metric label="处理中" value={processingCount.toString()} />
        <Metric label="失败" value={failedCount.toString()} />
      </div>
      <p className="mt-3 text-sm text-slate-500">
        近期任务 {jobsCount} 个 · 可见范围 {knowledgeBase.visibility === "shared" ? "成员可访问" : "私有"}
      </p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className={workspaceMetricTileClassName()}>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function DocumentPanel({
  documents,
  state,
}: {
  documents: MockDocument[];
  state: ReturnType<typeof useMockStore>["state"];
}): ReactElement {
  return (
    <Panel>
      <PanelHeader
        action={<ButtonLink href="/documents">查看全部文档</ButtonLink>}
        title={knowledgeCopy.documentsTitle}
      />
      <ScrollArea aria-label="文档摘要列表" className={workspaceSummaryListClassName()} size="lg">
        {documents.length === 0 ? (
          <WorkspaceSummaryEmptyState message="暂无文档，请上传文件或导入网页。" />
        ) : (
          workspaceVisibleDocuments(documents).map((document) => (
            <Link
              className={workspaceSummaryListItemClassName(true)}
              href={`/documents/${document.id}`}
              key={document.id}
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-950">{document.title}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {knowledgeBaseName(state, document.knowledgeBaseId)} · {sourceTypeLabel(document.sourceType)}
                  </p>
                </div>
                <StatusPill tone={document.status === "ready" ? "teal" : document.status === "failed" ? "red" : "yellow"}>
                  {statusLabel(document.status)}
                </StatusPill>
              </div>
            </Link>
          ))
        )}
      </ScrollArea>
    </Panel>
  );
}

function TaskSummary({
  jobs,
}: {
  jobs: ReturnType<typeof useMockStore>["state"]["jobs"];
}): ReactElement {
  return (
    <Panel>
      <PanelHeader action={<ButtonLink href="/tasks">查看任务</ButtonLink>} title="任务摘要" />
      <ScrollArea aria-label="任务摘要列表" className={workspaceSummaryListClassName()} size="lg">
        {jobs.length === 0 ? (
          <WorkspaceSummaryEmptyState message="暂无任务摘要。" />
        ) : (
          workspaceVisibleJobs(jobs).map((job) => (
            <Link className={workspaceSummaryListItemClassName(true)} href={workspaceTaskSummaryHref(job.id)} key={job.id}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-950">{job.id}</p>
                  <p className="mt-1 text-xs text-slate-500">步骤：{job.currentStep} · 尝试 {job.attempts}/{job.maxAttempts}</p>
                </div>
                <StatusPill tone={job.status === "failed" ? "red" : job.status === "succeeded" ? "teal" : "yellow"}>
                  {statusLabel(job.status)}
                </StatusPill>
              </div>
            </Link>
          ))
        )}
      </ScrollArea>
    </Panel>
  );
}

function LogSummary({
  logs,
}: {
  logs: ReturnType<typeof useMockStore>["state"]["logs"];
}): ReactElement {
  return (
    <Panel>
      <PanelHeader action={<ButtonLink href="/logs">查看日志</ButtonLink>} title="日志摘要" />
      <ScrollArea aria-label="日志摘要列表" className={workspaceSummaryListClassName()} size="lg">
        {logs.length === 0 ? (
          <WorkspaceSummaryEmptyState message="暂无日志摘要。" />
        ) : (
          workspaceVisibleLogs(logs).map((log) => (
            <Link className={workspaceSummaryListItemClassName(true)} href={workspaceLogSummaryHref(log.id)} key={log.id}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-950">{log.step}</p>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{log.message}</p>
                </div>
                <StatusPill tone={log.level === "error" ? "red" : log.level === "warning" ? "yellow" : "blue"}>
                  {statusLabel(log.level)}
                </StatusPill>
              </div>
            </Link>
          ))
        )}
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

function CreateKnowledgeDialog({ onClose }: { onClose: () => void }): ReactElement {
  const { dispatch } = useMockStore();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (name.trim().length === 0) {
      setError(knowledgeCopy.validation.nameRequired);
      return;
    }
    dispatch({ description: description.trim() || "暂无描述", name: name.trim(), type: "createKnowledgeBase" });
    onClose();
  }

  return (
    <DialogFrame
      description={knowledgeCopy.createKnowledgeBaseDescription}
      onClose={onClose}
      onSubmit={handleSubmit}
      title={knowledgeCopy.createKnowledgeBase}
    >
      <div className="space-y-4">
        {error === null ? null : <Notice tone="error">{error}</Notice>}
        <Field label="知识库名称" onChange={setName} value={name} />
        <Field label="描述" onChange={setDescription} value={description} />
        <Button type="submit" variant="primary">
          创建
        </Button>
      </div>
    </DialogFrame>
  );
}

function UploadDialog({
  knowledgeBase,
  onClose,
}: {
  knowledgeBase: MockKnowledgeBase;
  onClose: () => void;
}): ReactElement {
  const { dispatch } = useMockStore();
  const [fileName, setFileName] = useState("供应商准入规范.pdf");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (fileName.trim().length === 0) {
      setError(knowledgeCopy.validation.fileRequired);
      return;
    }
    dispatch({ fileName: fileName.trim(), knowledgeBaseId: knowledgeBase.id, type: "uploadFile" });
    onClose();
  }

  return (
    <DialogFrame
      description={`${knowledgeBase.name} · ${knowledgeCopy.uploadFileDescription}`}
      onClose={onClose}
      onSubmit={handleSubmit}
      title={knowledgeCopy.uploadFile}
    >
      <div className="space-y-4">
        {error === null ? null : <Notice tone="error">{error}</Notice>}
        <Field label="文件名" onChange={setFileName} value={fileName} />
        <Button type="submit" variant="primary">
          提交上传
        </Button>
      </div>
    </DialogFrame>
  );
}

function UrlDialog({
  knowledgeBase,
  onClose,
}: {
  knowledgeBase: MockKnowledgeBase;
  onClose: () => void;
}): ReactElement {
  const { dispatch } = useMockStore();
  const [url, setUrl] = useState("https://intranet.example.com/procurement/vendor-policy");
  const [error, setError] = useState<string | null>(null);
  const validUrl = useMemo(() => url.startsWith("https://") || url.startsWith("http://"), [url]);

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!validUrl) {
      setError(knowledgeCopy.validation.urlRequired);
      return;
    }
    dispatch({ knowledgeBaseId: knowledgeBase.id, title: "网页导入文档", type: "importUrl", url });
    onClose();
  }

  return (
    <DialogFrame
      description={`${knowledgeBase.name} · ${knowledgeCopy.importUrlDescription}`}
      onClose={onClose}
      onSubmit={handleSubmit}
      title={knowledgeCopy.importUrl}
    >
      <div className="space-y-4">
        {error === null ? null : <Notice tone="error">{error}</Notice>}
        <Field label="网页地址" onChange={setUrl} value={url} />
        <Button type="submit" variant="primary">
          创建导入任务
        </Button>
      </div>
    </DialogFrame>
  );
}

function Field({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}): ReactElement {
  const id = `field-${label}`;
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700" htmlFor={id}>
        {label}
      </label>
      <input
        className="mt-2 h-11 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
        id={id}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </div>
  );
}
