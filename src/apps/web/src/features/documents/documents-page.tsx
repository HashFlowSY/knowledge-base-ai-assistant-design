"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { useMemo, useState, type ReactElement } from "react";

import { knowledgeCopy } from "../../copy/knowledge";
import { knowledgeBaseName, sourceTypeLabel, statusLabel } from "../mock/selectors";
import { useMockStore } from "../mock/store";
import type { MockDocumentStatus, MockSourceType } from "../mock/types";
import { Button } from "../ui/button";
import { listActionLinkClassName } from "../ui/list-item-styles";
import { Notice } from "../ui/notice";
import { Panel, PanelHeader } from "../ui/panel";
import { ScrollArea } from "../ui/scroll-area";
import { SelectField, type SelectFieldOption } from "../ui/select-field";
import { StatusPill } from "../ui/status";
import { ProtectedPage } from "../shell/protected-page";
import { documentsListScrollClassName, documentsPanelClassName } from "./documents-layout";

export function DocumentsPage(): ReactElement {
  const { state } = useMockStore();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [showError, setShowError] = useState(false);
  const search = searchParams.get("search") ?? "";
  const status = (searchParams.get("status") ?? "all") as MockDocumentStatus | "all";
  const sourceType = (searchParams.get("sourceType") ?? "all") as MockSourceType | "all";
  const sort = searchParams.get("sort") ?? "updated";
  const filteredDocuments = useMemo(() => {
    const items = state.documents.filter((document) => {
      const haystack = `${document.title} ${knowledgeBaseName(state, document.knowledgeBaseId)}`.toLowerCase();
      const matchesSearch = haystack.includes(search.toLowerCase());
      const matchesStatus = status === "all" || document.status === status;
      const matchesSource = sourceType === "all" || document.sourceType === sourceType;
      return matchesSearch && matchesStatus && matchesSource;
    });

    return [...items].sort((left, right) => {
      if (sort === "title") {
        return left.title.localeCompare(right.title, "zh-CN");
      }

      return right.updatedAt.localeCompare(left.updatedAt);
    });
  }, [search, sort, sourceType, state, status]);

  function updateParam(key: string, value: string): void {
    const next = new URLSearchParams(searchParams.toString());
    if (value === "" || value === "all") {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    next.set("page", "1");
    router.replace(`${pathname}?${next.toString()}`);
  }

  return (
    <ProtectedPage>
      <Panel className={documentsPanelClassName()}>
        <PanelHeader
          description="按知识库、状态和来源查看所有文档。筛选和排序会写入 URL。"
          title={knowledgeCopy.documentListTitle}
        />
        <div className="grid gap-3 border-b border-slate-200 p-4 md:grid-cols-[minmax(0,1fr)_180px_180px_180px_auto]">
          <label className="flex min-h-11 items-center gap-2 rounded-md border border-slate-200 bg-white px-3">
            <Search aria-hidden="true" className="h-4 w-4 text-slate-400" />
            <span className="sr-only">搜索文档</span>
            <input
              className="min-w-0 flex-1 text-sm outline-none"
              onChange={(event) => updateParam("search", event.target.value)}
              placeholder="搜索文档或知识库"
              value={search}
            />
          </label>
          <Select
            label="状态"
            onChange={(value) => updateParam("status", value)}
            options={[
              ["all", "全部状态"],
              ["ready", "可用"],
              ["processing", "处理中"],
              ["failed", "失败"],
              ["empty", "空"],
            ]}
            value={status}
          />
          <Select
            label="来源"
            onChange={(value) => updateParam("sourceType", value)}
            options={[
              ["all", "全部来源"],
              ["file", "文件"],
              ["url", "网页"],
            ]}
            value={sourceType}
          />
          <Select
            label="排序"
            onChange={(value) => updateParam("sort", value)}
            options={[
              ["updated", "最近更新"],
              ["title", "标题"],
            ]}
            value={sort}
          />
          <Button onClick={() => setShowError((value) => !value)}>
            {showError ? "隐藏错误态" : "显示错误态"}
          </Button>
        </div>

        {showError ? (
          <div className="p-4">
            <Notice tone="error">文档列表加载失败，请重试。请求编号：req-doc-demo。</Notice>
          </div>
        ) : filteredDocuments.length === 0 ? (
          <div className="p-4">
            <Notice>当前筛选条件下暂无文档。</Notice>
          </div>
        ) : (
          <ScrollArea aria-label="文档列表" className={documentsListScrollClassName()} size="fill">
            {filteredDocuments.map((document) => (
              <Link
                className={listActionLinkClassName()}
                href={`/documents/${document.id}`}
                key={document.id}
              >
                <div className="grid gap-2 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_120px_120px_120px] md:items-center">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-950">{document.title}</p>
                    <p className="mt-1 text-xs text-slate-500">版本 {document.version}</p>
                  </div>
                  <p className="truncate text-sm text-slate-600">
                    {knowledgeBaseName(state, document.knowledgeBaseId)}
                  </p>
                  <p className="text-sm text-slate-600">{sourceTypeLabel(document.sourceType)}</p>
                  <StatusPill tone={document.status === "ready" ? "teal" : document.status === "failed" ? "red" : "yellow"}>
                    {statusLabel(document.status)}
                  </StatusPill>
                  <p className="text-xs text-slate-500">{document.updatedAt.slice(0, 10)}</p>
                </div>
              </Link>
            ))}
          </ScrollArea>
        )}
      </Panel>
    </ProtectedPage>
  );
}

function Select({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: [string, string][];
  value: string;
}): ReactElement {
  return (
    <SelectField
      ariaLabel={label}
      onChange={onChange}
      options={options.map(([optionValue, optionLabel]): SelectFieldOption => ({
        label: optionLabel,
        value: optionValue,
      }))}
      value={value}
    />
  );
}
