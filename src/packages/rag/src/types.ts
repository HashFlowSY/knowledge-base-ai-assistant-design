import { z } from "zod";

export const groundingLabelSchema = z.enum([
  "依据充分",
  "依据有限",
  "未找到依据",
]);

export type GroundingLabel = z.infer<typeof groundingLabelSchema>;

export const chatCitationSchema = z.object({
  id: z.string().min(1),
  messageId: z.string().min(1),
  retrievalRunId: z.string().min(1).nullable(),
  knowledgeBaseId: z.string().min(1),
  documentId: z.string().min(1),
  chunkId: z.string().min(1),
  sourceTitle: z.string().min(1),
  sourceUri: z.string().min(1),
  sourceLocator: z.string().min(1).nullable(),
  snippet: z.string().min(1),
  rank: z.number().int().positive(),
});

export type ChatCitation = z.infer<typeof chatCitationSchema>;

export const answerFeedbackRatingSchema = z.enum(["useful", "not_useful"]);

export type AnswerFeedbackRating = z.infer<typeof answerFeedbackRatingSchema>;

export const chatFeedbackSchema = z.object({
  id: z.string().min(1),
  rating: answerFeedbackRatingSchema,
  reason: z.string().nullable(),
  createdAt: z.string().datetime(),
});

export type ChatFeedback = z.infer<typeof chatFeedbackSchema>;

export const chatMessageSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  sequence: z.number().int().positive(),
  createdAt: z.string().datetime(),
  groundingLabel: groundingLabelSchema.nullable(),
  retrievalRunId: z.string().min(1).nullable(),
  citations: z.array(chatCitationSchema),
  feedback: chatFeedbackSchema.nullable(),
});

export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const chatSessionSummarySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  knowledgeBaseId: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  messageCount: z.number().int().min(0),
});

export type ChatSessionSummary = z.infer<typeof chatSessionSummarySchema>;

export const chatSessionsResponseSchema = z.object({
  sessions: z.array(chatSessionSummarySchema),
});

export type ChatSessionsResponse = z.infer<typeof chatSessionsResponseSchema>;

export const chatMessagesResponseSchema = z.object({
  messages: z.array(chatMessageSchema),
});

export type ChatMessagesResponse = z.infer<typeof chatMessagesResponseSchema>;

export const createChatSessionInputSchema = z.object({
  knowledgeBaseId: z.string().trim().min(1),
});

export type CreateChatSessionInput = z.infer<typeof createChatSessionInputSchema>;

export const createChatSessionResponseSchema = z.object({
  session: chatSessionSummarySchema,
});

export type CreateChatSessionResponse = z.infer<
  typeof createChatSessionResponseSchema
>;

export const submitChatQuestionInputSchema = z.object({
  knowledgeBaseId: z.string().trim().min(1),
  question: z.string().trim().min(1).max(4000),
  sessionId: z.string().trim().min(1).nullable().default(null),
});

export type SubmitChatQuestionInput = z.infer<
  typeof submitChatQuestionInputSchema
>;

export const chatSubmitResponseSchema = z.object({
  session: chatSessionSummarySchema,
  userMessage: chatMessageSchema,
  assistantMessage: chatMessageSchema,
});

export type ChatSubmitResponse = z.infer<typeof chatSubmitResponseSchema>;

export const submitAnswerFeedbackInputSchema = z.object({
  rating: answerFeedbackRatingSchema,
  reason: z.string().trim().max(1000).nullable().default(null),
  citationIds: z.array(z.string().min(1)).default([]),
});

export type SubmitAnswerFeedbackInput = z.infer<
  typeof submitAnswerFeedbackInputSchema
>;

export const submitAnswerFeedbackResponseSchema = z.object({
  feedback: chatFeedbackSchema,
});

export type SubmitAnswerFeedbackResponse = z.infer<
  typeof submitAnswerFeedbackResponseSchema
>;

export type RetrievalSource = "vector" | "keyword" | "hybrid";

export interface RetrievalSourceCandidate {
  chunkId: string;
  chunkIndex: number;
  content: string;
  documentId: string;
  documentTitle: string;
  knowledgeBaseId: string;
  metadata: Record<string, unknown>;
  score: number;
  sourceLocator: string | null;
  sourceUri: string;
  tokenEstimate: number;
}

export interface FusedRetrievalCandidate
  extends Omit<RetrievalSourceCandidate, "score"> {
  fusedScore: number;
  keywordRank?: number;
  keywordScore?: number;
  source: RetrievalSource;
  vectorRank?: number;
  vectorScore?: number;
}

export interface RankedRetrievalCandidate extends FusedRetrievalCandidate {
  rank: number;
  rerankScore?: number;
}

export interface RagContextCitation {
  chunkId: string;
  documentId: string;
  knowledgeBaseId: string;
  rank: number;
  snippet: string;
  sourceLocator: string | null;
  sourceTitle: string;
  sourceUri: string;
}

export interface RagContextItem {
  chunkIds: string[];
  content: string;
  documentId: string;
  knowledgeBaseId: string;
  rank: number;
  sourceLocator: string | null;
  sourceTitle: string;
  sourceUri: string;
  tokenEstimate: number;
}
