"use client";

import { Send } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, type ReactElement } from "react";

import { chatCopy } from "../../copy/chat";
import { useKnowledgeBases } from "../knowledge/knowledge-hooks";
import { ProtectedPage } from "../shell/protected-page";
import { Button } from "../ui/button";
import type { FormSubmitHandler } from "../ui/form-types";
import { Notice } from "../ui/notice";
import { Panel, PanelHeader } from "../ui/panel";
import { ScrollArea } from "../ui/scroll-area";
import {
  chatComposerGridClassName,
  chatLayoutGridClassName,
  chatMessageScrollClassName,
  chatMessagesFrameClassName,
  chatPanelClassName,
  chatPanelHeaderClassName,
  chatSubmitButtonClassName,
  chatTextareaClassName,
} from "./chat-layout";
import {
  CitationPanel,
  KnowledgeBasePicker,
  MessageBubble,
  SessionList,
  StarterPrompts,
} from "./chat-panels";
import {
  useChatMessages,
  useChatSessions,
  useCreateChatSession,
  useSubmitAnswerFeedback,
  useSubmitChatQuestion,
} from "./chat-hooks";

export function ChatPage(): ReactElement {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [question, setQuestion] = useState("");
  const [feedbackReason, setFeedbackReason] = useState("");
  const knowledgeBasesQuery = useKnowledgeBases({
    page: 1,
    pageSize: 8,
    sort: "updated",
  });
  const knowledgeBases = knowledgeBasesQuery.data?.items ?? [];
  const selectedKnowledgeBaseId =
    searchParams.get("knowledgeBaseId") ?? knowledgeBases[0]?.id ?? "";
  const sessionsQuery = useChatSessions({
    ...(selectedKnowledgeBaseId.length === 0
      ? {}
      : { knowledgeBaseId: selectedKnowledgeBaseId }),
  });
  const sessions = sessionsQuery.data ?? [];
  const selectedSessionId = searchParams.get("sessionId") ?? sessions[0]?.id ?? null;
  const messagesQuery = useChatMessages(selectedSessionId);
  const messages = messagesQuery.data ?? [];
  const answer = [...messages].reverse().find((message) => message.role === "assistant") ?? null;
  const activeCitationId = searchParams.get("citationId");
  const activeCitation =
    answer?.citations.find((citation) => citation.id === activeCitationId) ??
    answer?.citations[0] ??
    null;
  const createSession = useCreateChatSession();
  const submitQuestion = useSubmitChatQuestion();
  const submitFeedback = useSubmitAnswerFeedback(answer?.id ?? null);
  const isSubmitting = submitQuestion.isPending;

  function updateUrl(next: {
    citationId?: string | null;
    knowledgeBaseId?: string | null;
    sessionId?: string | null;
  }): void {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === null) {
        params.delete(key);
      } else if (value !== undefined) {
        params.set(key, value);
      }
    }
    const query = params.toString();
    router.replace(query.length > 0 ? `${pathname}?${query}` : pathname);
  }

  const handleSubmit: FormSubmitHandler = (event) => {
    event.preventDefault();
    const trimmedQuestion = question.trim();
    if (selectedKnowledgeBaseId.length === 0 || trimmedQuestion.length === 0) {
      return;
    }

    submitQuestion.mutate(
      {
        knowledgeBaseId: selectedKnowledgeBaseId,
        question: trimmedQuestion,
        sessionId: selectedSessionId,
      },
      {
        onSuccess: (result) => {
          updateUrl({
            citationId: null,
            knowledgeBaseId: result.session.knowledgeBaseId,
            sessionId: result.session.id,
          });
          setQuestion("");
        },
      },
    );
  };

  return (
    <ProtectedPage>
      <div className={chatLayoutGridClassName()}>
        <SessionList
          activeId={selectedSessionId}
          isLoading={sessionsQuery.isLoading}
          onNewSession={() => {
            if (selectedKnowledgeBaseId.length === 0) {
              return;
            }
            createSession.mutate(
              { knowledgeBaseId: selectedKnowledgeBaseId },
              {
                onSuccess: (result) =>
                  updateUrl({
                    citationId: null,
                    knowledgeBaseId: result.knowledgeBaseId,
                    sessionId: result.id,
                  }),
              },
            );
          }}
          onSelect={(sessionId) => updateUrl({ citationId: null, sessionId })}
          sessions={sessions}
        />

        <Panel className={`min-w-0 ${chatPanelClassName()}`}>
          <PanelHeader
            className={chatPanelHeaderClassName()}
            description={chatCopy.description}
            title={chatCopy.title}
          />
          <div className={chatMessagesFrameClassName()}>
            <KnowledgeBasePicker
              knowledgeBaseId={selectedKnowledgeBaseId}
              knowledgeBases={knowledgeBases}
              onChange={(knowledgeBaseId) =>
                updateUrl({
                  citationId: null,
                  knowledgeBaseId,
                  sessionId: null,
                })
              }
            />
            <ScrollArea aria-label="问答对话记录" className={chatMessageScrollClassName()} size="fill">
              {messagesQuery.isLoading ? (
                <Notice>正在加载对话。</Notice>
              ) : messages.length === 0 ? (
                <StarterPrompts onPick={setQuestion} />
              ) : (
                messages.map((message) => (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    onSelectCitation={(citationId) =>
                      updateUrl({ citationId, sessionId: selectedSessionId })
                    }
                  />
                ))
              )}
              {submitQuestion.isError ? (
                <Notice tone="error">{chatCopy.failed}</Notice>
              ) : null}
            </ScrollArea>
            <form className="border-t border-slate-200 p-4" onSubmit={handleSubmit}>
              <div className={chatComposerGridClassName()}>
                <label className="block lg:col-span-2">
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
                  disabled={
                    selectedKnowledgeBaseId.length === 0 ||
                    question.trim().length === 0 ||
                    isSubmitting
                  }
                  disabledReason={chatCopy.submitDisabled}
                  type="submit"
                  variant="primary"
                >
                  <Send aria-hidden="true" className="h-4 w-4" />
                  {isSubmitting ? "生成中" : chatCopy.submitQuestion}
                </Button>
              </div>
            </form>
          </div>
        </Panel>

        <CitationPanel
          activeCitation={activeCitation}
          answer={answer}
          feedbackReason={feedbackReason}
          onFeedback={(rating) => {
            submitFeedback.mutate({
              citationIds: answer?.citations.map((citation) => citation.id) ?? [],
              rating,
              reason: feedbackReason.length === 0 ? null : feedbackReason,
            });
          }}
          onReasonChange={setFeedbackReason}
          onSelect={(citationId) =>
            updateUrl({ citationId, sessionId: selectedSessionId })
          }
        />
      </div>
    </ProtectedPage>
  );
}
