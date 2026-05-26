import { z } from "zod";

export * from "./context";
export * from "./fusion";
export * from "./service";
export * from "./service-types";
export * from "./types";

export const retrievalCandidateSchema = z.object({
  chunkId: z.string().min(1),
  documentId: z.string().min(1),
  knowledgeBaseId: z.string().min(1),
  score: z.number().min(0),
  source: z.enum(["vector", "keyword"]),
});

export type RetrievalCandidate = z.infer<typeof retrievalCandidateSchema>;

export const answerCitationSchema = z.object({
  citationId: z.string().min(1),
  chunkId: z.string().min(1),
  documentId: z.string().min(1),
  snippet: z.string().min(1),
});

export type AnswerCitation = z.infer<typeof answerCitationSchema>;
