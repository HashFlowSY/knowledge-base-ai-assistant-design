import type { ChatCitation, ChatMessage } from "@kb/rag";

export function getVisibleAnswer(
  messages: ChatMessage[],
  activeCitationId: string | null,
): ChatMessage | null {
  const assistantMessages = messages.filter(
    (message) => message.role === "assistant",
  );

  if (activeCitationId !== null) {
    const answerWithActiveCitation = assistantMessages.find((message) =>
      message.citations.some((citation) => citation.id === activeCitationId),
    );

    if (answerWithActiveCitation !== undefined) {
      return answerWithActiveCitation;
    }
  }

  return assistantMessages.at(-1) ?? null;
}

export function getActiveCitation(
  answer: ChatMessage | null,
  activeCitationId: string | null,
): ChatCitation | null {
  if (answer === null) {
    return null;
  }

  return (
    answer.citations.find((citation) => citation.id === activeCitationId) ??
    answer.citations[0] ??
    null
  );
}
