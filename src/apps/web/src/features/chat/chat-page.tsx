"use client";

import { Send, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useState,
  type Dispatch,
  type ReactElement,
  type SetStateAction,
} from "react";

import type { ChatMessage, ChatStreamEvent } from "@kb/rag";

import { chatCopy } from "../../copy/chat";
import { useKnowledgeBases } from "@/features/hooks/knowledge/knowledge-hooks";
import { ProtectedPage } from "../shell/protected-page";
import { Button } from "@/components/ui/button";
import type { FormSubmitHandler } from "@/lib/form-types";
import { Notice } from "@/components/ui/alert";
import { Panel, PanelHeader } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  chatComposerGridClassName,
  chatLayoutGridClassName,
  chatMessageScrollContentClassName,
  chatMessageScrollClassName,
  chatMessagesFrameClassName,
  chatPanelClassName,
  chatPanelHeaderClassName,
  chatSubmitButtonClassName,
  chatTextareaClassName,
} from "./chat-layout";
import { getActiveCitation, getVisibleAnswer } from "./chat-selection";
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
  useSubmitChatQuestionStream,
} from "../hooks/chat/chat-hooks";

interface TemporaryChatStream {
  assistantMessage: ChatMessage | null;
  hasAnswerDelta: boolean;
  originalKnowledgeBaseId: string;
  originalSessionId: string | null;
  sessionId: string | null;
  userMessage: ChatMessage | null;
  userMessagePersisted: boolean;
}

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
  const persistedMessages = messagesQuery.data ?? [];
  const [temporaryStream, setTemporaryStream] =
    useState<TemporaryChatStream | null>(null);
  const messages = mergeTemporaryMessages({
    persistedMessages,
    selectedSessionId,
    stream: temporaryStream,
  });
  const activeCitationId = searchParams.get("citationId");
  const answer = getVisibleAnswer(messages, activeCitationId);
  const persistedAnswer = getVisibleAnswer(persistedMessages, activeCitationId);
  const citationPanelAnswer = temporaryStream === null ? answer : persistedAnswer;
  const activeCitation = getActiveCitation(citationPanelAnswer, activeCitationId);
  const createSession = useCreateChatSession();
  const submitQuestion = useSubmitChatQuestionStream();
  const submitFeedback = useSubmitAnswerFeedback(citationPanelAnswer?.id ?? null);
  const isSubmitting = submitQuestion.isStreaming;

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

    setTemporaryStream(
      createTemporaryChatStream({
        knowledgeBaseId: selectedKnowledgeBaseId,
        messageCount: persistedMessages.length,
        question: trimmedQuestion,
        sessionId: selectedSessionId,
      }),
    );
    setQuestion("");

    void submitQuestion.submit(
      {
        knowledgeBaseId: selectedKnowledgeBaseId,
        question: trimmedQuestion,
        sessionId: selectedSessionId,
      },
      {
        onCancel: () => {
          setTemporaryStream((current) =>
            handleTemporaryStreamStop(current, updateUrl),
          );
        },
        onError: () => {
          setTemporaryStream((current) =>
            handleTemporaryStreamStop(current, updateUrl),
          );
        },
        onEvent: (streamEvent) => {
          handleChatStreamEvent({
            event: streamEvent,
            setTemporaryStream,
            updateUrl,
          });
        },
      },
    );
  };

  return (
    <ProtectedPage>
      <div className={chatLayoutGridClassName()}>
        <SessionList
          activeId={selectedSessionId}
          isError={sessionsQuery.isError}
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
            <ScrollArea
              aria-label="问答对话记录"
              className={chatMessageScrollClassName()}
              size="fill"
            >
              <div className={chatMessageScrollContentClassName()}>
                {messagesQuery.isLoading && temporaryStream === null ? (
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
                {submitQuestion.error !== null ? (
                  <Notice tone="error">{submitQuestion.error.message}</Notice>
                ) : null}
              </div>
            </ScrollArea>
            <form className="border-t border-border p-4" onSubmit={handleSubmit}>
              <div className={chatComposerGridClassName()}>
                <label className="block lg:col-span-2">
                  <span className="sr-only">{chatCopy.composerLabel}</span>
                  <textarea
                    className={chatTextareaClassName()}
                    disabled={isSubmitting}
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
                    (!isSubmitting && question.trim().length === 0)
                  }
                  disabledReason={chatCopy.submitDisabled}
                  onClick={isSubmitting ? submitQuestion.cancel : undefined}
                  type={isSubmitting ? "button" : "submit"}
                  variant={isSubmitting ? "secondary" : "primary"}
                >
                  {isSubmitting ? (
                    <X aria-hidden="true" className="h-4 w-4" />
                  ) : (
                    <Send aria-hidden="true" className="h-4 w-4" />
                  )}
                  {isSubmitting ? chatCopy.cancelGeneration : chatCopy.submitQuestion}
                </Button>
              </div>
            </form>
          </div>
        </Panel>

        <CitationPanel
          activeCitation={activeCitation}
          answer={citationPanelAnswer}
          feedbackReason={feedbackReason}
          onFeedback={(rating) => {
            submitFeedback.mutate({
              citationIds:
                citationPanelAnswer?.citations.map((citation) => citation.id) ?? [],
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

function createTemporaryChatStream(input: {
  knowledgeBaseId: string;
  messageCount: number;
  question: string;
  sessionId: string | null;
}): TemporaryChatStream {
  const now = new Date().toISOString();
  const sessionId = input.sessionId ?? "pending_stream_session";
  const userSequence = input.messageCount + 1;

  return {
    assistantMessage: {
      citations: [],
      content: chatCopy.retrieving,
      createdAt: now,
      feedback: null,
      groundingLabel: null,
      id: `temp_assistant_${now}`,
      retrievalRunId: null,
      role: "assistant",
      sequence: userSequence + 1,
      sessionId,
    },
    hasAnswerDelta: false,
    originalKnowledgeBaseId: input.knowledgeBaseId,
    originalSessionId: input.sessionId,
    sessionId: input.sessionId,
    userMessage: {
      citations: [],
      content: input.question,
      createdAt: now,
      feedback: null,
      groundingLabel: null,
      id: `temp_user_${now}`,
      retrievalRunId: null,
      role: "user",
      sequence: userSequence,
      sessionId,
    },
    userMessagePersisted: false,
  };
}

function mergeTemporaryMessages(input: {
  persistedMessages: ChatMessage[];
  selectedSessionId: string | null;
  stream: TemporaryChatStream | null;
}): ChatMessage[] {
  if (input.stream === null) {
    return input.persistedMessages;
  }

  const streamSessionId = input.stream.sessionId ?? input.stream.originalSessionId;
  if (
    streamSessionId !== input.selectedSessionId &&
    input.stream.originalSessionId !== input.selectedSessionId
  ) {
    return input.persistedMessages;
  }

  return [
    ...input.persistedMessages,
    ...(input.stream.userMessage === null ? [] : [input.stream.userMessage]),
    ...(input.stream.assistantMessage === null
      ? []
      : [input.stream.assistantMessage]),
  ];
}

function handleChatStreamEvent(input: {
  event: ChatStreamEvent;
  setTemporaryStream: Dispatch<SetStateAction<TemporaryChatStream | null>>;
  updateUrl: (next: {
    citationId?: string | null;
    knowledgeBaseId?: string | null;
    sessionId?: string | null;
  }) => void;
}): void {
  const { event } = input;

  if (event.event === "session") {
    input.updateUrl({
      citationId: null,
      knowledgeBaseId: event.data.session.knowledgeBaseId,
      sessionId: event.data.session.id,
    });
    input.setTemporaryStream((current) =>
      current === null
        ? null
        : {
            ...current,
            assistantMessage:
              current.assistantMessage === null
                ? null
                : { ...current.assistantMessage, sessionId: event.data.session.id },
            sessionId: event.data.session.id,
            userMessage:
              current.userMessage === null
                ? null
                : { ...current.userMessage, sessionId: event.data.session.id },
          },
    );
    return;
  }

  if (event.event === "user_message") {
    input.setTemporaryStream((current) =>
      current === null
        ? null
        : {
            ...current,
            assistantMessage:
              current.assistantMessage === null
                ? null
                : {
                    ...current.assistantMessage,
                    sequence: event.data.userMessage.sequence + 1,
                    sessionId: event.data.sessionId,
                  },
            sessionId: event.data.sessionId,
            userMessage: event.data.userMessage,
            userMessagePersisted: true,
          },
    );
    return;
  }

  if (event.event === "retrieval_completed") {
    input.setTemporaryStream((current) =>
      current === null
        ? null
        : {
            ...current,
            assistantMessage:
              current.assistantMessage === null
                ? null
                : {
                    ...current.assistantMessage,
                    content: chatCopy.generating,
                    groundingLabel: event.data.groundingLabel,
                    retrievalRunId: event.data.retrievalRunId,
                  },
          },
    );
    return;
  }

  if (event.event === "answer_delta") {
    input.setTemporaryStream((current) => {
      if (current === null || current.assistantMessage === null) {
        return current;
      }

      return {
        ...current,
        assistantMessage: {
          ...current.assistantMessage,
          content: current.hasAnswerDelta
            ? `${current.assistantMessage.content}${event.data.delta}`
            : event.data.delta,
          retrievalRunId: event.data.retrievalRunId,
        },
        hasAnswerDelta: true,
      };
    });
    return;
  }

  if (event.event === "answer_completed") {
    input.updateUrl({
      citationId: null,
      knowledgeBaseId: event.data.session.knowledgeBaseId,
      sessionId: event.data.session.id,
    });
    input.setTemporaryStream(null);
    return;
  }
}

function handleTemporaryStreamStop(
  current: TemporaryChatStream | null,
  updateUrl: (next: {
    citationId?: string | null;
    knowledgeBaseId?: string | null;
    sessionId?: string | null;
  }) => void,
): TemporaryChatStream | null {
  if (current === null) {
    return null;
  }

  if (!current.userMessagePersisted) {
    updateUrl({
      citationId: null,
      knowledgeBaseId: current.originalKnowledgeBaseId,
      sessionId: current.originalSessionId,
    });
    return null;
  }

  return {
    ...current,
    assistantMessage: null,
  };
}
