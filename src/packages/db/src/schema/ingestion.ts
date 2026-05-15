import {
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { authUsers } from "./auth";
import { emptyJsonObject } from "./common";
import {
  documents,
  documentSourceTypeEnum,
  knowledgeBases,
} from "./knowledge";
import { tenants } from "./tenant";

export const ingestionJobStatusEnum = pgEnum("ingestion_job_status", [
  "queued",
  "running",
  "retrying",
  "completed",
  "failed",
  "cancelled",
]);

export const ingestionStepEnum = pgEnum("ingestion_step", [
  "source_connector",
  "parser",
  "normalizer",
  "chunker",
  "embedding",
  "index_writer",
]);

export const ingestionLogLevelEnum = pgEnum("ingestion_log_level", [
  "info",
  "warn",
  "error",
]);

export const ingestionJobs = pgTable(
  "ingestion_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    knowledgeBaseId: uuid("knowledge_base_id")
      .notNull()
      .references(() => knowledgeBases.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    requestedByUserId: text("requested_by_user_id").references(
      () => authUsers.id,
      { onDelete: "set null" },
    ),
    sourceType: documentSourceTypeEnum("source_type").notNull(),
    status: ingestionJobStatusEnum("status").notNull().default("queued"),
    currentStep: ingestionStepEnum("current_step"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    lastErrorCode: varchar("last_error_code", { length: 120 }),
    lastErrorMessage: text("last_error_message"),
    sourceHash: varchar("source_hash", { length: 128 }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>()
      .notNull()
      .default(emptyJsonObject),
    queuedAt: timestamp("queued_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("ingestion_jobs_tenant_idx").on(table.tenantId),
    foreignKey({
      name: "ingestion_jobs_tenant_kb_fk",
      columns: [table.tenantId, table.knowledgeBaseId],
      foreignColumns: [knowledgeBases.tenantId, knowledgeBases.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "ingestion_jobs_tenant_document_fk",
      columns: [table.tenantId, table.documentId],
      foreignColumns: [documents.tenantId, documents.id],
    }).onDelete("cascade"),
    index("ingestion_jobs_kb_idx").on(table.tenantId, table.knowledgeBaseId),
    index("ingestion_jobs_document_idx").on(table.documentId),
    index("ingestion_jobs_status_created_idx").on(
      table.status,
      table.createdAt,
    ),
    index("ingestion_jobs_current_step_idx").on(table.currentStep),
  ],
);

export const ingestionJobLogs = pgTable(
  "ingestion_job_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    jobId: uuid("job_id")
      .notNull()
      .references(() => ingestionJobs.id, { onDelete: "cascade" }),
    step: ingestionStepEnum("step"),
    level: ingestionLogLevelEnum("level").notNull().default("info"),
    message: text("message").notNull(),
    errorCode: varchar("error_code", { length: 120 }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>()
      .notNull()
      .default(emptyJsonObject),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("ingestion_job_logs_tenant_idx").on(table.tenantId),
    index("ingestion_job_logs_job_idx").on(table.jobId, table.createdAt),
    index("ingestion_job_logs_level_idx").on(table.level),
  ],
);
