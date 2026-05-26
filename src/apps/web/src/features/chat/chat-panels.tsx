"use client";

import { MessageSquarePlus, ThumbsDown, ThumbsUp } from "lucide-react";
import { useMemo, type ReactElement } from "react";

import type { ChatCitation, ChatMessage, ChatSessionSummary } from "@kb/rag";

import { chatCopy } from "../../copy/chat";
import { Button } from "../ui/button";
import {
  cardActionButtonClassName,
  listActionButtonClassName,
} from "../ui/list-item-styles";
import { Notice } from "../ui/notice";
import { Panel, PanelHeader } from "../ui/panel";
import { ScrollArea } from "../ui/scroll-area";
import { SelectField } from "../ui/select-field";
import { StatusPill } from "../ui/status";
import {
  chatCitationScrollClassName,
  chatPanelClassName,
  chatPanelHeaderClassName,
  chatSessionScrollClassName,
} from "./chat-layout";

export function SessionList({
  activeId,
  isLoading,
  onNewSession,
  onSelect,
  sessions,
}: {
  activeId: string | null;
  isLoading: boolean;
  onNewSession: () => void;
  onSelect: (sessionId: string) => void;
  sessions: ChatSessionSummary[];
}): ReactElement {
  return (
    <Panel className={chatPanelClassName()}>
      <PanelHeader
        action={
          <Button
            aria-label={chatCopy.newSession}
            className="min-w-11 px-2"
            onClick={onNewSession}
            variant="secondary"
          >
            <MessageSquarePlus aria-hidden="true" className="h-4 w-4" />
          </Button>
        }
        className={chatPanelHeaderClassName()}
        description={chatCopy.sessionsDescription}
        title="会话"
      />
      <ScrollArea aria-label="会话列表" className={chatSessionScrollClassName()} size="fill">
        {isLoading ? <Notice>正在加载会话。</Notice> : null}
        {sessions.map((session) => (
          <button
            aria-pressed={session.id === activeId}
            className={listActionButtonClassName(session.id === activeId)}
            key={session.id}
            onClick={() => onSelect(session.id)}
            type="button"
          >
            <p className="truncate text-sm font-semibold text-slate-950">
              {session.title}
            </p>
            <p className="mt-1 truncate text-xs text-slate-500">
              {session.messageCount} 条消息
            </p>
          </button>
        ))}
      </ScrollArea>
    </Panel>
  );
}

export function KnowledgeBasePicker({
  knowledgeBaseId,
  knowledgeBases,
  onChange,
}: {
  knowledgeBaseId: string;
  knowledgeBases: { id: string; name: string }[];
  onChange: (knowledgeBaseId: string) => void;
}): ReactElement {
  const options = useMemo(
    () => knowledgeBases.map((item) => ({ label: item.name, value: item.id })),
    [knowledgeBases],
  );

  return (
    <div className="border-t border-slate-200 p-4">
      <SelectField
        ariaLabel="选择知识库"
        onChange={onChange}
        options={options}
        value={knowledgeBaseId}
      />
    </div>
  );
}

export function StarterPrompts({
  onPick,
}: {
  onPick: (value: string) => void;
}): ReactElement {
  const prompts = ["如何开始使用知识库？", "哪些信息需要先入库？", "怎样核验回答引用？"];

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm font-semibold text-slate-950">选择一个问题开始</p>
      <div className="mt-3 grid gap-2">
        {prompts.map((prompt) => (
          <button
            className="min-h-11 rounded-md border border-slate-200 bg-white px-3 py-2 text-left text-sm hover:bg-slate-50"
            key={prompt}
            onClick={() => onPick(prompt)}
            type="button"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}

export function MessageBubble({
  message,
  onSelectCitation,
}: {
  message: ChatMessage;
  onSelectCitation: (citationId: string) => void;
}): ReactElement {
  const isAssistant = message.role === "assistant";

  return (
    <article className={`flex ${isAssistant ? "justify-start" : "justify-end"}`}>
      <div className={messageBubbleClassName(isAssistant)}>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-medium text-slate-500">
            {isAssistant ? "助手" : "你"}
          </p>
          {message.groundingLabel === null ? null : (
            <StatusPill
              tone={message.groundingLabel === "未找到依据" ? "yellow" : "teal"}
            >
              {message.groundingLabel}
            </StatusPill>
          )}
          {message.feedback === null ? null : (
            <StatusPill tone="teal">{chatCopy.feedbackSubmitted}</StatusPill>
          )}
        </div>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800">
          {message.content}
        </p>
        {isAssistant && message.citations.length === 0 ? (
          <div className="mt-3">
            <Notice>{chatCopy.noCitation}</Notice>
          </div>
        ) : null}
        {message.citations.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {message.citations.map((citation) => (
              <button
                className="min-h-11 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-teal-700"
                key={citation.id}
                onClick={() => onSelectCitation(citation.id)}
                type="button"
              >
                引用 · {citation.sourceLocator ?? `#${citation.rank}`}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}

export function CitationPanel({
  activeCitation,
  answer,
  feedbackReason,
  onFeedback,
  onReasonChange,
  onSelect,
}: {
  activeCitation: ChatCitation | null;
  answer: ChatMessage | null;
  feedbackReason: string;
  onFeedback: (rating: "useful" | "not_useful") => void;
  onReasonChange: (value: string) => void;
  onSelect: (citationId: string) => void;
}): ReactElement {
  const citations = answer?.citations ?? [];

  return (
    <Panel className={chatPanelClassName()}>
      <PanelHeader
        className={chatPanelHeaderClassName()}
        description="核验来源，并提交答案级反馈。"
        title={chatCopy.citationPanel}
      />
      <ScrollArea aria-label="引用核验内容" className={chatCitationScrollClassName()} size="fill">
        {answer === null ? <Notice>选择或生成一条助手答案后查看引用。</Notice> : null}
        {answer !== null && citations.length === 0 ? <Notice>{chatCopy.noCitation}</Notice> : null}
        {citations.map((citation) => (
          <button
            className={cardActionButtonClassName(citation.id === activeCitation?.id)}
            key={citation.id}
            onClick={() => onSelect(citation.id)}
            type="button"
          >
            <p className="text-sm font-semibold text-slate-950">
              {citation.sourceTitle}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {citation.sourceLocator ?? `引用 ${citation.rank}`}
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              {citation.snippet}
            </p>
          </button>
        ))}
        {answer === null || answer.role !== "assistant" ? null : (
          <FeedbackForm
            answer={answer}
            feedbackReason={feedbackReason}
            onFeedback={onFeedback}
            onReasonChange={onReasonChange}
          />
        )}
      </ScrollArea>
    </Panel>
  );
}

function FeedbackForm({
  answer,
  feedbackReason,
  onFeedback,
  onReasonChange,
}: {
  answer: ChatMessage;
  feedbackReason: string;
  onFeedback: (rating: "useful" | "not_useful") => void;
  onReasonChange: (value: string) => void;
}): ReactElement {
  return (
    <div className="border-t border-slate-200 pt-4">
      <p className="text-sm font-semibold text-slate-950">{chatCopy.feedbackReason}</p>
      <textarea
        className="mt-2 min-h-24 w-full rounded-md border border-slate-200 p-3 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
        onChange={(event) => onReasonChange(event.target.value)}
        placeholder="可选，说明原因"
        value={feedbackReason}
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          disabled={answer.feedback !== null}
          disabledReason={chatCopy.feedbackDisabled}
          onClick={() => onFeedback("useful")}
          variant="primary"
        >
          <ThumbsUp aria-hidden="true" className="h-4 w-4" />
          {chatCopy.feedbackUseful}
        </Button>
        <Button
          disabled={answer.feedback !== null}
          disabledReason={chatCopy.feedbackDisabled}
          onClick={() => onFeedback("not_useful")}
        >
          <ThumbsDown aria-hidden="true" className="h-4 w-4" />
          {chatCopy.feedbackNotUseful}
        </Button>
      </div>
      {answer.feedback === null ? null : (
        <p className="mt-2 text-sm text-teal-700">{chatCopy.submittedHint}</p>
      )}
    </div>
  );
}

function messageBubbleClassName(isAssistant: boolean): string {
  return [
    "max-w-[min(760px,92%)] rounded-md border p-3",
    isAssistant ? "border-slate-200 bg-white" : "border-teal-200 bg-teal-50",
  ].join(" ");
}
