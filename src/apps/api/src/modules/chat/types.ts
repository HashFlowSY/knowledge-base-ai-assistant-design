import { z } from "zod";

export {
  chatMessagesResponseSchema,
  chatSessionsResponseSchema,
  chatSubmitResponseSchema,
  createChatSessionInputSchema,
  createChatSessionResponseSchema,
  submitAnswerFeedbackInputSchema,
  submitAnswerFeedbackResponseSchema,
  submitChatQuestionInputSchema,
} from "@kb/rag";

export type {
  ChatMessagesResponse,
  ChatSessionsResponse,
  ChatSubmitResponse,
  CreateChatSessionInput,
  CreateChatSessionResponse,
  SubmitAnswerFeedbackInput,
  SubmitAnswerFeedbackResponse,
  SubmitChatQuestionInput,
} from "@kb/rag";

export const listChatSessionsQuerySchema = z.object({
  knowledgeBaseId: z.string().trim().uuid().optional(),
});

export type ListChatSessionsQuery = z.infer<
  typeof listChatSessionsQuerySchema
>;

export const chatSessionMessagesParamsSchema = z.object({
  sessionId: z.string().uuid(),
});

export const chatMessageFeedbackParamsSchema = z.object({
  messageId: z.string().uuid(),
});

export type ChatSessionMessagesParams = z.infer<
  typeof chatSessionMessagesParamsSchema
>;
export type ChatMessageFeedbackParams = z.infer<
  typeof chatMessageFeedbackParamsSchema
>;
