"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MessageSquarePlus, RotateCcw, Send } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent, type ReactElement } from "react";

import { chatCopy } from "../../copy/chat";
import { knowledgeBaseName } from "../mock/selectors";
import { useMockStore } from "../mock/store";
import type { ChatAnswerMode, MockChatMessage, MockChatSession, MockCitation } from "../mock/types";
import { Button } from "../ui/button";
import { cardActionButtonClassName, listActionButtonClassName } from "../ui/list-item-styles";
import { Notice } from "../ui/notice";
import { Panel, PanelHeader } from "../ui/panel";
import { ScrollArea } from "../ui/scroll-area";
import { SelectField } from "../ui/select-field";
import { StatusPill } from "../ui/status";
import { ProtectedPage } from "../shell/protected-page";
import {
  chatComposerGridClassName,
  chatCitationScrollClassName,
  chatLayoutGridClassName,
  chatMessageScrollClassName,
  chatMessagesFrameClassName,
  chatModeSelectClassName,
  chatModeSelectPlacement,
  chatPanelClassName,
  chatPanelHeaderClassName,
  chatSessionScrollClassName,
  chatSubmitButtonClassName,
  chatTextareaClassName,
} from "./chat-layout";

export function ChatPage(): ReactElement {
  const { dispatch, state } = useMockStore();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [question, setQuestion] = useState("");
  const [mode, setMode] = useState<ChatAnswerMode>("with_citation");
  const sessionIdFromUrl = searchParams.get("sessionId");
  const citationIdFromUrl = searchParams.get("citationId");
  const selectedSession =
    state.chatSessions.find((item) => item.id === sessionIdFromUrl) ??
    state.chatSessions.find((item) => item.id === state.selectedChatSessionId) ??
    state.chatSessions[0];
  const selectedAnswer = selectedSession?.messages.find(
    (item) => item.id === selectedSession.selectedAnswerId,
  );
  const selectedCitation = state.citations.find((item) =>
    selectedAnswer?.citationIds.includes(item.id),
  );
  const [activeCitationId, setActiveCitationId] = useState<string | null>(
    citationIdFromUrl ?? selectedCitation?.id ?? null,
  );
  const activeCitation =
    state.citations.find((item) => item.id === activeCitationId) ?? selectedCitation ?? null;
  const selectedKnowledgeBaseName =
    selectedSession === undefined ? null : knowledgeBaseName(state, selectedSession.knowledgeBaseId);

  useEffect(() => {
    if (selectedSession !== undefined && selectedSession.id !== state.selectedChatSessionId) {
      dispatch({ sessionId: selectedSession.id, type: "selectChatSession" });
    }
  }, [dispatch, selectedSession, state.selectedChatSessionId]);

  useEffect(() => {
    setActiveCitationId(citationIdFromUrl ?? selectedCitation?.id ?? null);
  }, [citationIdFromUrl, selectedCitation?.id]);

  function updateUrl(next: { citationId?: string | null; sessionId?: string | null }): void {
    const params = new URLSearchParams(searchParams.toString());
    if (next.sessionId !== undefined) {
      if (next.sessionId === null) {
        params.delete("sessionId");
      } else {
        params.set("sessionId", next.sessionId);
      }
    }
    if (next.citationId !== undefined) {
      if (next.citationId === null) {
        params.delete("citationId");
      } else {
        params.set("citationId", next.citationId);
      }
    }
    const query = params.toString();
    router.replace(query.length > 0 ? `${pathname}?${query}` : pathname);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (selectedSession === undefined || question.trim().length === 0) {
      return;
    }
    dispatch({
      knowledgeBaseId: selectedSession.knowledgeBaseId,
      mode,
      question,
      sessionId: selectedSession.id,
      type: "submitChatQuestion",
    });
    updateUrl({ citationId: null, sessionId: selectedSession.id });
    setQuestion("");
  }

  function retryAnswer(messageId: string): void {
    if (selectedSession === undefined) {
      return;
    }

    const failedIndex = selectedSession.messages.findIndex((item) => item.id === messageId);
    const previousQuestion = selectedSession.messages
      .slice(0, failedIndex < 0 ? selectedSession.messages.length : failedIndex)
      .reverse()
      .find((item) => item.role === "user");
    dispatch({
      knowledgeBaseId: selectedSession.knowledgeBaseId,
      mode: "with_citation",
      question: previousQuestion?.content ?? "重试失败答案",
      sessionId: selectedSession.id,
      type: "submitChatQuestion",
    });
    updateUrl({ citationId: null, sessionId: selectedSession.id });
  }

  return (
    <ProtectedPage>
      <div className={chatLayoutGridClassName()}>
        <SessionList
          activeId={selectedSession?.id ?? null}
          state={state}
          onNewSession={() => {
            dispatch({ knowledgeBaseId: state.selectedKnowledgeBaseId, type: "newChatSession" });
            updateUrl({ citationId: null, sessionId: null });
          }}
          onSelect={(sessionId) => {
            dispatch({ sessionId, type: "selectChatSession" });
            updateUrl({ citationId: null, sessionId });
          }}
          sessions={state.chatSessions}
        />

        <Panel className={`min-w-0 ${chatPanelClassName()}`}>
          <PanelHeader
            className={chatPanelHeaderClassName()}
            description={
              selectedKnowledgeBaseName === null
                ? chatCopy.description
                : `${chatCopy.description} 当前范围：${selectedKnowledgeBaseName}`
            }
            title={chatCopy.title}
          />
          <div className={chatMessagesFrameClassName()}>
            <ScrollArea aria-label="问答对话记录" className={chatMessageScrollClassName()} size="fill">
              {selectedSession === undefined || selectedSession.messages.length === 0 ? (
                <StarterPrompts onPick={setQuestion} />
              ) : (
                selectedSession.messages.map((message) => (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    onRetry={retryAnswer}
                    onSelectCitation={(citationId) => {
                      setActiveCitationId(citationId);
                      updateUrl({ citationId, sessionId: selectedSession.id });
                    }}
                    state={state}
                  />
                ))
              )}
            </ScrollArea>
            <form className="border-t border-slate-200 p-4" onSubmit={handleSubmit}>
              <div className={chatComposerGridClassName()}>
                <SelectField
                  ariaLabel="生成模式"
                  className={chatModeSelectClassName()}
                  onChange={(value) => setMode(value as ChatAnswerMode)}
                  options={[
                    { label: chatCopy.modes.with_citation, value: "with_citation" },
                    { label: chatCopy.modes.retrieving, value: "retrieving" },
                    { label: chatCopy.modes.generating, value: "generating" },
                    { label: chatCopy.modes.no_citation, value: "no_citation" },
                    { label: chatCopy.modes.failed, value: "failed" },
                  ]}
                  placement={chatModeSelectPlacement()}
                  value={mode}
                />
                <label className="block">
                  <span className="sr-only">{chatCopy.composerLabel}</span>
                  <textarea
                    className={chatTextareaClassName()}
                    onChange={(event) => setQuestion(event.target.value)}
                    placeholder={chatCopy.composerPlaceholder}
                    rows={1}
                    value={question}
                  />
                </label>
                <Button
                  className={chatSubmitButtonClassName()}
                  disabled={selectedSession === undefined || question.trim().length === 0}
                  disabledReason={chatCopy.submitDisabled}
                  type="submit"
                  variant="primary"
                >
                  <Send aria-hidden="true" className="h-4 w-4" />
                  {chatCopy.submitQuestion}
                </Button>
              </div>
            </form>
          </div>
        </Panel>

        <CitationPanel
          activeCitation={activeCitation}
          answer={selectedAnswer ?? null}
          onSelect={(citationId) => {
            setActiveCitationId(citationId);
            updateUrl({ citationId, sessionId: selectedSession?.id ?? null });
          }}
        />
      </div>
    </ProtectedPage>
  );
}

function SessionList({
  activeId,
  onNewSession,
  onSelect,
  sessions,
  state,
}: {
  activeId: string | null;
  onNewSession: () => void;
  onSelect: (sessionId: string) => void;
  sessions: MockChatSession[];
  state: ReturnType<typeof useMockStore>["state"];
}): ReactElement {
  return (
    <Panel className={chatPanelClassName()}>
      <PanelHeader
        action={
          <Button
            aria-label={chatCopy.newSession}
            className="min-w-11 px-2"
            onClick={onNewSession}
            title={chatCopy.newSession}
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
        {sessions.map((session) => (
          <button
            aria-pressed={session.id === activeId}
            className={listActionButtonClassName(session.id === activeId)}
            key={session.id}
            onClick={() => onSelect(session.id)}
            type="button"
          >
            <p className="truncate text-sm font-semibold text-slate-950">{session.title}</p>
            <p className="mt-1 truncate text-xs text-slate-500">
              {knowledgeBaseName(state, session.knowledgeBaseId)} · {session.messages.length} 条消息
            </p>
          </button>
        ))}
      </ScrollArea>
    </Panel>
  );
}

function StarterPrompts({ onPick }: { onPick: (value: string) => void }): ReactElement {
  const prompts = ["差旅住宿标准是多少？", "付款超过 50 万需要谁审批？", "发票异常如何处理？"];

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

function MessageBubble({
  message,
  onRetry,
  onSelectCitation,
  state,
}: {
  message: MockChatMessage;
  onRetry: (messageId: string) => void;
  onSelectCitation: (citationId: string) => void;
  state: ReturnType<typeof useMockStore>["state"];
}): ReactElement {
  const citations = state.citations.filter((item) => message.citationIds.includes(item.id));
  const isAssistant = message.role === "assistant";

  return (
    <article className={`flex ${isAssistant ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[min(760px,92%)] rounded-md border p-3 ${
          isAssistant ? "border-slate-200 bg-white" : "border-teal-200 bg-teal-50"
        }`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-medium text-slate-500">{isAssistant ? "助手" : "你"}</p>
          {isAssistant ? <LifecycleBadge lifecycle={message.lifecycle} /> : null}
          {message.feedback === null ? null : <StatusPill tone="teal">{chatCopy.feedbackSubmitted}</StatusPill>}
        </div>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800">{message.content}</p>
        {message.lifecycle === "no_citation" ? (
          <div className="mt-3">
            <Notice>{chatCopy.noCitation}</Notice>
          </div>
        ) : null}
        {message.lifecycle === "failed" ? (
          <div className="mt-3 space-y-3">
            <Notice tone="error">{chatCopy.failed}</Notice>
            <Button onClick={() => onRetry(message.id)}>
              <RotateCcw aria-hidden="true" className="h-4 w-4" />
              {chatCopy.retryFailed}
            </Button>
          </div>
        ) : null}
        {citations.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {citations.map((citation) => (
              <button
                className="min-h-11 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-teal-700"
                key={citation.id}
                onClick={() => onSelectCitation(citation.id)}
                type="button"
              >
                引用 · {citation.locator}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function LifecycleBadge({ lifecycle }: { lifecycle: MockChatMessage["lifecycle"] }): ReactElement {
  if (lifecycle === "completed") {
    return <StatusPill tone="teal">已生成</StatusPill>;
  }
  if (lifecycle === "no_citation") {
    return <StatusPill tone="yellow">无引用</StatusPill>;
  }
  if (lifecycle === "failed") {
    return <StatusPill tone="red">失败</StatusPill>;
  }
  if (lifecycle === "retrieving") {
    return <StatusPill tone="blue">检索中</StatusPill>;
  }
  if (lifecycle === "generating") {
    return <StatusPill tone="blue">生成中</StatusPill>;
  }

  return <StatusPill>等待中</StatusPill>;
}

function CitationPanel({
  activeCitation,
  answer,
  onSelect,
}: {
  activeCitation: MockCitation | null;
  answer: MockChatMessage | null;
  onSelect: (citationId: string) => void;
}): ReactElement {
  const { dispatch, state } = useMockStore();
  const [reason, setReason] = useState("");
  const citations = useMemo(
    () => state.citations.filter((item) => answer?.citationIds.includes(item.id)),
    [answer, state.citations],
  );

  return (
    <Panel className={chatPanelClassName()}>
      <PanelHeader
        className={chatPanelHeaderClassName()}
        description="核验来源、跳转文档，并提交答案级反馈。"
        title={chatCopy.citationPanel}
      />
      <ScrollArea aria-label="引用核验内容" className={chatCitationScrollClassName()} size="fill">
        {answer === null ? (
          <Notice>选择或生成一条助手答案后查看引用。</Notice>
        ) : citations.length === 0 ? (
          <Notice>{chatCopy.noCitation}</Notice>
        ) : (
          <div className="space-y-2">
            {citations.map((citation) => (
              <button
                className={cardActionButtonClassName(citation.id === activeCitation?.id)}
                key={citation.id}
                onClick={() => onSelect(citation.id)}
                type="button"
              >
                <p className="text-sm font-semibold text-slate-950">{citation.title}</p>
                <p className="mt-1 text-xs text-slate-500">{citation.locator}</p>
                <p className="mt-2 text-sm leading-6 text-slate-700">{citation.excerpt}</p>
                <p className="mt-2 text-xs text-slate-500">{citation.matchReason}</p>
              </button>
            ))}
          </div>
        )}

        <div className="border-t border-slate-200 pt-4">
          {activeCitation === null ? null : (
            <Link
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-teal-700 bg-teal-700 px-3 py-2 text-sm font-medium text-white"
              href={`/documents/${activeCitation.documentId}?chunkId=${activeCitation.chunkId}&citationId=${activeCitation.id}`}
            >
              打开相关文档
            </Link>
          )}
        </div>

        {answer === null || answer.role !== "assistant" ? null : (
          <div className="border-t border-slate-200 pt-4">
            <p className="text-sm font-semibold text-slate-950">{chatCopy.feedbackReason}</p>
            <textarea
              className="mt-2 min-h-24 w-full rounded-md border border-slate-200 p-3 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
              onChange={(event) => setReason(event.target.value)}
              placeholder="可选，说明原因"
              value={reason}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                disabled={answer.feedback !== null}
                disabledReason={chatCopy.feedbackDisabled}
                onClick={() =>
                  dispatch({
                    answerMessageId: answer.id,
                    rating: "useful",
                    reason,
                    type: "submitChatFeedback",
                  })
                }
                variant="primary"
              >
                {chatCopy.feedbackUseful}
              </Button>
              <Button
                disabled={answer.feedback !== null}
                disabledReason={chatCopy.feedbackDisabled}
                onClick={() =>
                  dispatch({
                    answerMessageId: answer.id,
                    rating: "not_useful",
                    reason,
                    type: "submitChatFeedback",
                  })
                }
              >
                {chatCopy.feedbackNotUseful}
              </Button>
            </div>
            {answer.feedback === null ? null : (
              <p className="mt-2 text-sm text-teal-700">{chatCopy.submittedHint}</p>
            )}
          </div>
        )}
      </ScrollArea>
    </Panel>
  );
}
