"use client";

import { useSearchParams } from "next/navigation";
import { ArrowLeft, Search } from "lucide-react";
import { useMemo, useState, type ReactElement } from "react";

import { knowledgeCopy } from "../../copy/knowledge";
import { knowledgeBaseName, sourceTypeLabel, statusLabel } from "../mock/selectors";
import { useMockStore } from "../mock/store";
import type { MockChunk, MockDocument } from "../mock/types";
import { Button, ButtonLink } from "../ui/button";
import { Drawer } from "../ui/drawer";
import { listActionButtonClassName } from "../ui/list-item-styles";
import { Notice } from "../ui/notice";
import { Panel, PanelHeader } from "../ui/panel";
import { ScrollArea } from "../ui/scroll-area";
import { StatusPill } from "../ui/status";
import { ProtectedPage } from "../shell/protected-page";
import {
  documentChunkDetailScrollClassName,
  documentChunkPlaceholderClassName,
  documentChunkReturnButtonClassName,
  documentChunkReturnLabel,
  documentDetailExitHref,
  documentDetailHeaderActionsClassName,
  documentDetailLogHref,
  documentDetailMainClassName,
  documentDetailPageGridClassName,
  documentDetailRelatedLogIds,
  documentDetailSideClassName,
  documentDetailTaskHref,
  documentProcessingSummaryScrollClassName,
  latestDocumentLogId,
} from "./document-detail-layout";
import { canShowDocumentProcessingLogLink } from "./document-detail-permissions";

export function DocumentDetailPage({ documentId }: { documentId: string }): ReactElement {
  const { state } = useMockStore();
  const searchParams = useSearchParams();
  const highlightedChunkId = searchParams.get("chunkId");
  const [search, setSearch] = useState("");
  const [selectedChunkId, setSelectedChunkId] = useState<string | null>(highlightedChunkId);
  const document = state.documents.find((item) => item.id === documentId);
  const source = state.sources.find((item) => item.documentId === documentId);
  const chunks = state.chunks.filter((item) => item.documentId === documentId);
  const filteredChunks = useMemo(
    () =>
      chunks.filter((chunk) =>
        `${chunk.summary} ${chunk.content} ${chunk.locator}`.toLowerCase().includes(search.toLowerCase()),
      ),
    [chunks, search],
  );
  const selectedChunk = state.chunks.find((item) => item.id === selectedChunkId) ?? null;
  const canShowProcessingLogLink = canShowDocumentProcessingLogLink(state.session.role);

  if (document === undefined) {
    return (
      <ProtectedPage>
        <Panel className="mx-auto max-w-2xl">
          <PanelHeader description="请返回文档列表选择一个有效文档。" title="文档不存在" />
          <div className="p-4">
            <ButtonLink href="/documents">返回文档列表</ButtonLink>
          </div>
        </Panel>
      </ProtectedPage>
    );
  }

  const relatedLogIds = documentDetailRelatedLogIds(state.jobs, document.jobIds);
  const documentLogs = state.logs.filter((log) => log.documentId === document.id);
  const latestLogId = latestDocumentLogId(documentLogs, relatedLogIds);

  return (
    <ProtectedPage>
      <div className={documentDetailPageGridClassName()}>
        <section className={documentDetailMainClassName()}>
          <Panel>
            <PanelHeader
              action={
                <div className={documentDetailHeaderActionsClassName()}>
                  <ButtonLink href={documentDetailExitHref()}>
                    <ArrowLeft aria-hidden="true" className="h-4 w-4" />
                    返回文档列表
                  </ButtonLink>
                  <ButtonLink href={documentDetailTaskHref(document.jobIds)}>查看相关任务</ButtonLink>
                  {canShowProcessingLogLink ? (
                    <ButtonLink href={documentDetailLogHref(latestLogId)}>查看日志</ButtonLink>
                  ) : null}
                </div>
              }
              description={`${knowledgeBaseName(state, document.knowledgeBaseId)} · ${sourceTypeLabel(document.sourceType)} · ${document.version}`}
              title={document.title}
            />
            <div className="grid gap-3 p-4 sm:grid-cols-4">
              <Info label="状态" value={statusLabel(document.status)} />
              <Info label="创建人" value={document.createdBy} />
              <Info label="创建时间" value={document.createdAt.slice(0, 10)} />
              <Info label="更新时间" value={document.updatedAt.slice(0, 10)} />
            </div>
          </Panel>

          <Panel>
            <PanelHeader title={knowledgeCopy.sourcePreview} />
            <div className="grid gap-3 p-4 md:grid-cols-2">
              {source === undefined ? (
                <Notice>暂无来源信息。</Notice>
              ) : (
                <>
                  <Info label="来源类型" value={sourceTypeLabel(source.sourceType)} />
                  <Info label="处理状态" value={statusLabel(source.processingStatus)} />
                  <Info label="来源标识" value={source.fileName ?? source.url ?? "未记录"} />
                  <Info label="哈希摘要" value={source.hashSummary} />
                  <Info label="对象键/标题" value={source.objectKey ?? source.fetchedTitle ?? "未记录"} />
                  <Info label="摘要" value={source.fetchedSummary ?? source.mimeType ?? "暂无摘要"} />
                </>
              )}
            </div>
          </Panel>

          <Panel>
            <PanelHeader title={knowledgeCopy.chunks}>
              <label className="mt-3 flex min-h-11 items-center gap-2 rounded-md border border-slate-200 bg-white px-3">
                <Search aria-hidden="true" className="h-4 w-4 text-slate-400" />
                <span className="sr-only">搜索片段</span>
                <input
                  className="min-w-0 flex-1 text-sm outline-none"
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="搜索片段内容、摘要或位置"
                  value={search}
                />
              </label>
            </PanelHeader>
            {filteredChunks.length === 0 ? (
              <div className="p-4">
                <Notice>{knowledgeCopy.noChunks}</Notice>
              </div>
            ) : (
              <ScrollArea aria-label="文档片段列表" className="divide-y divide-slate-200" size="lg">
                {filteredChunks.map((chunk) => (
                  <ChunkRow
                    active={chunk.id === highlightedChunkId || chunk.id === selectedChunkId}
                    chunk={chunk}
                    key={chunk.id}
                    onSelect={() => setSelectedChunkId(chunk.id)}
                  />
                ))}
              </ScrollArea>
            )}
          </Panel>
        </section>

        <aside className={documentDetailSideClassName()}>
          <RelatedPanel document={document} />
          {selectedChunk === null ? (
            <Panel className={documentChunkPlaceholderClassName()}>
              <PanelHeader title={knowledgeCopy.chunkDrawerTitle} />
              <div className="p-4">
                <Notice>选择片段后查看完整内容和脱敏 metadata。</Notice>
              </div>
            </Panel>
          ) : (
            <Drawer onClose={() => setSelectedChunkId(null)} title={knowledgeCopy.chunkDrawerTitle}>
              <ChunkDetail chunk={selectedChunk} onReturn={() => setSelectedChunkId(null)} />
            </Drawer>
          )}
        </aside>
      </div>
    </ProtectedPage>
  );
}

function Info({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm font-medium text-slate-900">{value}</p>
    </div>
  );
}

function ChunkRow({
  active,
  chunk,
  onSelect,
}: {
  active: boolean;
  chunk: MockChunk;
  onSelect: () => void;
}): ReactElement {
  return (
    <button
      className={listActionButtonClassName(active)}
      onClick={onSelect}
      type="button"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-950">片段 {chunk.index} · {chunk.locator}</p>
          <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-600">{chunk.summary}</p>
        </div>
        <StatusPill tone="slate">{chunk.tokenEstimate} tokens</StatusPill>
      </div>
    </button>
  );
}

function ChunkDetail({ chunk, onReturn }: { chunk: MockChunk; onReturn: () => void }): ReactElement {
  return (
    <ScrollArea aria-label="片段详情" className={documentChunkDetailScrollClassName()} size="md">
      <Button className={documentChunkReturnButtonClassName()} onClick={onReturn}>
        {documentChunkReturnLabel()}
      </Button>
      <Info label="来源位置" value={chunk.locator} />
      <Info label="Token 估算" value={chunk.tokenEstimate.toString()} />
      <Info label="内容哈希" value={chunk.contentHash} />
      <div>
        <p className="text-sm font-medium text-slate-700">完整内容</p>
        <p className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-700">
          {chunk.content}
        </p>
      </div>
      <Info label="脱敏 metadata" value={chunk.sanitizedMetadata} />
    </ScrollArea>
  );
}

function RelatedPanel({ document }: { document: MockDocument }): ReactElement {
  return (
    <Panel>
      <PanelHeader title="处理摘要" />
      <ScrollArea aria-label="处理摘要" className={documentProcessingSummaryScrollClassName()} size="sm">
        <Info label="任务" value={`${document.jobIds.length} 个相关任务`} />
        <Info label="片段" value={`${document.chunkIds.length} 个片段`} />
        <Button
          className="w-full"
          disabled={document.status === "ready"}
          disabledReason={knowledgeCopy.disabled.readyDocumentRetry}
        >
          重试处理
        </Button>
      </ScrollArea>
    </Panel>
  );
}
