import {
  boolean,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { authUsers } from "./auth";
import { emptyJsonArray, emptyJsonObject } from "./common";
import { documentChunks, documents, knowledgeBases } from "./knowledge";
import { providerConfigs } from "./provider";
import { tenants } from "./tenant";

export const chatMessageRoleEnum = pgEnum("chat_message_role", [
  "user",
  "assistant",
  "system",
]);

export const retrievalRunStatusEnum = pgEnum("retrieval_run_status", [
  "running",
  "completed",
  "failed",
]);

export const retrievalResultSourceEnum = pgEnum("retrieval_result_source", [
  "vector",
  "keyword",
  "hybrid",
]);

export const answerFeedbackRatingEnum = pgEnum("answer_feedback_rating", [
  "useful",
  "not_useful",
]);

export const chatSessions = pgTable(
  "chat_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => authUsers.id, {
      onDelete: "set null",
    }),
    title: varchar("title", { length: 500 }),
    selectedKnowledgeBaseIds: jsonb("selected_knowledge_base_ids")
      .$type<string[]>()
      .notNull()
      .default(emptyJsonArray),
    metadata: jsonb("metadata").$type<Record<string, unknown>>()
      .notNull()
      .default(emptyJsonObject),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("chat_sessions_tenant_idx").on(table.tenantId),
    uniqueIndex("chat_sessions_tenant_id_id_idx").on(table.tenantId, table.id),
    index("chat_sessions_user_idx").on(table.tenantId, table.userId),
    index("chat_sessions_created_idx").on(table.tenantId, table.createdAt),
  ],
);

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => chatSessions.id, { onDelete: "cascade" }),
    role: chatMessageRoleEnum("role").notNull(),
    content: text("content").notNull(),
    sequence: integer("sequence").notNull(),
    providerId: uuid("provider_id").references(() => providerConfigs.id, {
      onDelete: "set null",
    }),
    modelId: varchar("model_id", { length: 200 }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>()
      .notNull()
      .default(emptyJsonObject),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("chat_messages_session_sequence_idx").on(
      table.sessionId,
      table.sequence,
    ),
    index("chat_messages_tenant_idx").on(table.tenantId),
    uniqueIndex("chat_messages_tenant_id_id_idx").on(table.tenantId, table.id),
    foreignKey({
      name: "chat_messages_tenant_session_fk",
      columns: [table.tenantId, table.sessionId],
      foreignColumns: [chatSessions.tenantId, chatSessions.id],
    }).onDelete("cascade"),
    index("chat_messages_session_idx").on(table.sessionId),
    index("chat_messages_created_idx").on(table.tenantId, table.createdAt),
  ],
);

export const retrievalRuns = pgTable(
  "retrieval_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => chatSessions.id, { onDelete: "cascade" }),
    messageId: uuid("message_id").references(() => chatMessages.id, {
      onDelete: "set null",
    }),
    status: retrievalRunStatusEnum("status").notNull().default("running"),
    query: text("query").notNull(),
    selectedKnowledgeBaseIds: jsonb("selected_knowledge_base_ids")
      .$type<string[]>()
      .notNull()
      .default(emptyJsonArray),
    embeddingProviderId: uuid("embedding_provider_id").references(
      () => providerConfigs.id,
      { onDelete: "set null" },
    ),
    rerankProviderId: uuid("rerank_provider_id").references(
      () => providerConfigs.id,
      { onDelete: "set null" },
    ),
    metadata: jsonb("metadata").$type<Record<string, unknown>>()
      .notNull()
      .default(emptyJsonObject),
    errorCode: varchar("error_code", { length: 120 }),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("retrieval_runs_tenant_idx").on(table.tenantId),
    uniqueIndex("retrieval_runs_tenant_id_id_idx").on(table.tenantId, table.id),
    foreignKey({
      name: "retrieval_runs_tenant_session_fk",
      columns: [table.tenantId, table.sessionId],
      foreignColumns: [chatSessions.tenantId, chatSessions.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "retrieval_runs_tenant_message_fk",
      columns: [table.tenantId, table.messageId],
      foreignColumns: [chatMessages.tenantId, chatMessages.id],
    }),
    index("retrieval_runs_session_idx").on(table.sessionId),
    index("retrieval_runs_message_idx").on(table.messageId),
    index("retrieval_runs_status_created_idx").on(
      table.status,
      table.createdAt,
    ),
  ],
);

export const retrievalResults = pgTable(
  "retrieval_results",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    runId: uuid("run_id")
      .notNull()
      .references(() => retrievalRuns.id, { onDelete: "cascade" }),
    knowledgeBaseId: uuid("knowledge_base_id")
      .notNull()
      .references(() => knowledgeBases.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    chunkId: uuid("chunk_id")
      .notNull()
      .references(() => documentChunks.id, { onDelete: "cascade" }),
    source: retrievalResultSourceEnum("source").notNull(),
    rank: integer("rank").notNull(),
    vectorScore: numeric("vector_score", { precision: 12, scale: 8 }),
    keywordScore: numeric("keyword_score", { precision: 12, scale: 8 }),
    fusedScore: numeric("fused_score", { precision: 12, scale: 8 }).notNull(),
    rerankScore: numeric("rerank_score", { precision: 12, scale: 8 }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>()
      .notNull()
      .default(emptyJsonObject),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("retrieval_results_run_chunk_idx").on(table.runId, table.chunkId),
    index("retrieval_results_tenant_idx").on(table.tenantId),
    foreignKey({
      name: "retrieval_results_tenant_run_fk",
      columns: [table.tenantId, table.runId],
      foreignColumns: [retrievalRuns.tenantId, retrievalRuns.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "retrieval_results_tenant_kb_fk",
      columns: [table.tenantId, table.knowledgeBaseId],
      foreignColumns: [knowledgeBases.tenantId, knowledgeBases.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "retrieval_results_tenant_document_fk",
      columns: [table.tenantId, table.documentId],
      foreignColumns: [documents.tenantId, documents.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "retrieval_results_tenant_chunk_fk",
      columns: [table.tenantId, table.chunkId],
      foreignColumns: [documentChunks.tenantId, documentChunks.id],
    }).onDelete("cascade"),
    index("retrieval_results_run_rank_idx").on(table.runId, table.rank),
    index("retrieval_results_kb_idx").on(table.tenantId, table.knowledgeBaseId),
    index("retrieval_results_document_idx").on(table.documentId),
  ],
);

export const answerCitations = pgTable(
  "answer_citations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    messageId: uuid("message_id")
      .notNull()
      .references(() => chatMessages.id, { onDelete: "cascade" }),
    retrievalRunId: uuid("retrieval_run_id").references(() => retrievalRuns.id, {
      onDelete: "set null",
    }),
    knowledgeBaseId: uuid("knowledge_base_id")
      .notNull()
      .references(() => knowledgeBases.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    chunkId: uuid("chunk_id")
      .notNull()
      .references(() => documentChunks.id, { onDelete: "cascade" }),
    sourceTitle: text("source_title").notNull(),
    sourceUri: text("source_uri").notNull(),
    sourceLocator: text("source_locator"),
    snippet: text("snippet").notNull(),
    rank: integer("rank").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("answer_citations_message_rank_idx").on(
      table.messageId,
      table.rank,
    ),
    index("answer_citations_tenant_idx").on(table.tenantId),
    uniqueIndex("answer_citations_tenant_id_id_idx").on(table.tenantId, table.id),
    foreignKey({
      name: "answer_citations_tenant_message_fk",
      columns: [table.tenantId, table.messageId],
      foreignColumns: [chatMessages.tenantId, chatMessages.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "answer_citations_tenant_run_fk",
      columns: [table.tenantId, table.retrievalRunId],
      foreignColumns: [retrievalRuns.tenantId, retrievalRuns.id],
    }),
    foreignKey({
      name: "answer_citations_tenant_kb_fk",
      columns: [table.tenantId, table.knowledgeBaseId],
      foreignColumns: [knowledgeBases.tenantId, knowledgeBases.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "answer_citations_tenant_document_fk",
      columns: [table.tenantId, table.documentId],
      foreignColumns: [documents.tenantId, documents.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "answer_citations_tenant_chunk_fk",
      columns: [table.tenantId, table.chunkId],
      foreignColumns: [documentChunks.tenantId, documentChunks.id],
    }).onDelete("cascade"),
    index("answer_citations_message_idx").on(table.messageId),
    index("answer_citations_run_idx").on(table.retrievalRunId),
    index("answer_citations_document_idx").on(table.documentId),
  ],
);

export const answerFeedback = pgTable(
  "answer_feedback",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    messageId: uuid("message_id")
      .notNull()
      .references(() => chatMessages.id, { onDelete: "cascade" }),
    retrievalRunId: uuid("retrieval_run_id").references(() => retrievalRuns.id, {
      onDelete: "set null",
    }),
    actorId: text("actor_id").references(() => authUsers.id, {
      onDelete: "set null",
    }),
    rating: answerFeedbackRatingEnum("rating").notNull(),
    reason: text("reason"),
    isResolved: boolean("is_resolved").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("answer_feedback_tenant_idx").on(table.tenantId),
    uniqueIndex("answer_feedback_tenant_id_id_idx").on(table.tenantId, table.id),
    foreignKey({
      name: "answer_feedback_tenant_message_fk",
      columns: [table.tenantId, table.messageId],
      foreignColumns: [chatMessages.tenantId, chatMessages.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "answer_feedback_tenant_run_fk",
      columns: [table.tenantId, table.retrievalRunId],
      foreignColumns: [retrievalRuns.tenantId, retrievalRuns.id],
    }),
    index("answer_feedback_message_idx").on(table.messageId),
    index("answer_feedback_run_idx").on(table.retrievalRunId),
    index("answer_feedback_actor_idx").on(table.tenantId, table.actorId),
  ],
);

export const answerFeedbackCitations = pgTable(
  "answer_feedback_citations",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    feedbackId: uuid("feedback_id")
      .notNull()
      .references(() => answerFeedback.id, { onDelete: "cascade" }),
    citationId: uuid("citation_id")
      .notNull()
      .references(() => answerCitations.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({
      columns: [table.feedbackId, table.citationId],
      name: "answer_feedback_citations_pk",
    }),
    foreignKey({
      name: "answer_feedback_citations_tenant_feedback_fk",
      columns: [table.tenantId, table.feedbackId],
      foreignColumns: [answerFeedback.tenantId, answerFeedback.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "answer_feedback_citations_tenant_citation_fk",
      columns: [table.tenantId, table.citationId],
      foreignColumns: [answerCitations.tenantId, answerCitations.id],
    }).onDelete("cascade"),
    index("answer_feedback_citations_tenant_idx").on(table.tenantId),
    index("answer_feedback_citations_citation_idx").on(table.citationId),
  ],
);
