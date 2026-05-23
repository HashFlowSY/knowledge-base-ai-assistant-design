import {
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
  vector,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { authUsers } from "./auth";
import { emptyJsonObject, vectorDimensions } from "./common";
import { providerConfigs } from "./provider";
import { tenantMemberRoleEnum, tenants } from "./tenant";

export const knowledgeBaseVisibilityEnum = pgEnum("knowledge_base_visibility", [
  "private",
  "tenant",
]);

export const documentStatusEnum = pgEnum("document_status", [
  "pending",
  "processing",
  "ready",
  "failed",
  "archived",
]);

export const documentSourceTypeEnum = pgEnum("document_source_type", [
  "file",
  "url",
]);

export const documentSourceUploadStatusEnum = pgEnum(
  "document_source_upload_status",
  ["pending_upload", "available", "upload_failed"],
);

export const documentSourceScanStatusEnum = pgEnum("document_source_scan_status", [
  "not_scanned",
  "pending",
  "clean",
  "infected",
  "scan_failed",
]);

export const documentSourceObjectCleanupStatusEnum = pgEnum(
  "document_source_object_cleanup_status",
  ["not_required", "pending_cleanup", "cleanup_succeeded", "cleanup_failed"],
);

export const knowledgeBases = pgTable(
  "knowledge_bases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    slug: varchar("slug", { length: 120 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description"),
    visibility: knowledgeBaseVisibilityEnum("visibility")
      .notNull()
      .default("private"),
    createdByUserId: text("created_by_user_id").references(() => authUsers.id, {
      onDelete: "set null",
    }),
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
    uniqueIndex("knowledge_bases_tenant_slug_idx").on(
      table.tenantId,
      table.slug,
    ),
    index("knowledge_bases_tenant_idx").on(table.tenantId),
    uniqueIndex("knowledge_bases_tenant_id_id_idx").on(table.tenantId, table.id),
    index("knowledge_bases_created_by_idx").on(table.createdByUserId),
  ],
);

export const knowledgeBaseMembers = pgTable(
  "knowledge_base_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    knowledgeBaseId: uuid("knowledge_base_id")
      .notNull()
      .references(() => knowledgeBases.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    role: tenantMemberRoleEnum("role").notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("knowledge_base_members_kb_user_idx").on(
      table.knowledgeBaseId,
      table.userId,
    ),
    foreignKey({
      name: "knowledge_base_members_tenant_kb_fk",
      columns: [table.tenantId, table.knowledgeBaseId],
      foreignColumns: [knowledgeBases.tenantId, knowledgeBases.id],
    }).onDelete("cascade"),
    index("knowledge_base_members_tenant_idx").on(table.tenantId),
    index("knowledge_base_members_user_idx").on(table.tenantId, table.userId),
  ],
);

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    knowledgeBaseId: uuid("knowledge_base_id")
      .notNull()
      .references(() => knowledgeBases.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 500 }).notNull(),
    status: documentStatusEnum("status").notNull().default("pending"),
    currentVersion: integer("current_version").notNull().default(1),
    createdByUserId: text("created_by_user_id").references(() => authUsers.id, {
      onDelete: "set null",
    }),
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
    index("documents_tenant_idx").on(table.tenantId),
    uniqueIndex("documents_tenant_id_id_idx").on(table.tenantId, table.id),
    foreignKey({
      name: "documents_tenant_kb_fk",
      columns: [table.tenantId, table.knowledgeBaseId],
      foreignColumns: [knowledgeBases.tenantId, knowledgeBases.id],
    }).onDelete("cascade"),
    index("documents_kb_status_idx").on(
      table.tenantId,
      table.knowledgeBaseId,
      table.status,
    ),
    index("documents_created_at_idx").on(table.tenantId, table.createdAt),
  ],
);

export const documentSources = pgTable(
  "document_sources",
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
    sourceType: documentSourceTypeEnum("source_type").notNull(),
    sourceUri: text("source_uri").notNull(),
    sourceHash: varchar("source_hash", { length: 128 }).notNull(),
    mimeType: varchar("mime_type", { length: 200 }),
    sizeBytes: integer("size_bytes"),
    bucket: varchar("bucket", { length: 255 }).notNull(),
    objectKey: text("object_key"),
    uploadStatus: documentSourceUploadStatusEnum("upload_status")
      .notNull()
      .default("available"),
    scanStatus: documentSourceScanStatusEnum("scan_status")
      .notNull()
      .default("not_scanned"),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }),
    uploadErrorCode: varchar("upload_error_code", { length: 120 }),
    uploadErrorMessage: text("upload_error_message"),
    objectCleanupStatus: documentSourceObjectCleanupStatusEnum(
      "object_cleanup_status",
    )
      .notNull()
      .default("not_required"),
    objectCleanupErrorCode: varchar("object_cleanup_error_code", {
      length: 120,
    }),
    objectCleanupErrorMessage: text("object_cleanup_error_message"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>()
      .notNull()
      .default(emptyJsonObject),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("document_sources_document_hash_idx").on(
      table.documentId,
      table.sourceHash,
    ),
    uniqueIndex("document_sources_active_source_hash_idx")
      .on(
        table.tenantId,
        table.knowledgeBaseId,
        table.sourceType,
        table.sourceHash,
      )
      .where(sql`${table.uploadStatus} in ('pending_upload', 'available')`),
    index("document_sources_tenant_idx").on(table.tenantId),
    foreignKey({
      name: "document_sources_tenant_kb_fk",
      columns: [table.tenantId, table.knowledgeBaseId],
      foreignColumns: [knowledgeBases.tenantId, knowledgeBases.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "document_sources_tenant_document_fk",
      columns: [table.tenantId, table.documentId],
      foreignColumns: [documents.tenantId, documents.id],
    }).onDelete("cascade"),
    index("document_sources_kb_idx").on(table.tenantId, table.knowledgeBaseId),
    index("document_sources_document_idx").on(table.documentId),
  ],
);

export const documentChunks = pgTable(
  "document_chunks",
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
    documentVersion: integer("document_version").notNull(),
    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    contentHash: varchar("content_hash", { length: 128 }).notNull(),
    tokenEstimate: integer("token_estimate").notNull(),
    sourceLocator: text("source_locator"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>()
      .notNull()
      .default(emptyJsonObject),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("document_chunks_document_version_index_idx").on(
      table.documentId,
      table.documentVersion,
      table.chunkIndex,
    ),
    uniqueIndex("document_chunks_document_hash_idx").on(
      table.documentId,
      table.documentVersion,
      table.contentHash,
    ),
    index("document_chunks_tenant_idx").on(table.tenantId),
    uniqueIndex("document_chunks_tenant_id_id_idx").on(table.tenantId, table.id),
    foreignKey({
      name: "document_chunks_tenant_kb_fk",
      columns: [table.tenantId, table.knowledgeBaseId],
      foreignColumns: [knowledgeBases.tenantId, knowledgeBases.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "document_chunks_tenant_document_fk",
      columns: [table.tenantId, table.documentId],
      foreignColumns: [documents.tenantId, documents.id],
    }).onDelete("cascade"),
    index("document_chunks_kb_idx").on(table.tenantId, table.knowledgeBaseId),
    index("document_chunks_document_idx").on(table.documentId),
  ],
);

export const chunkEmbeddings = pgTable(
  "chunk_embeddings",
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
    chunkId: uuid("chunk_id")
      .notNull()
      .references(() => documentChunks.id, { onDelete: "cascade" }),
    providerId: uuid("provider_id").references(() => providerConfigs.id, {
      onDelete: "set null",
    }),
    modelId: varchar("model_id", { length: 200 }).notNull(),
    dimensions: integer("dimensions").notNull().default(
      vectorDimensions.chunkEmbedding,
    ),
    embedding: vector("embedding", {
      dimensions: vectorDimensions.chunkEmbedding,
    }).notNull(),
    contentHash: varchar("content_hash", { length: 128 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("chunk_embeddings_chunk_model_idx").on(
      table.chunkId,
      table.modelId,
    ),
    index("chunk_embeddings_tenant_idx").on(table.tenantId),
    foreignKey({
      name: "chunk_embeddings_tenant_kb_fk",
      columns: [table.tenantId, table.knowledgeBaseId],
      foreignColumns: [knowledgeBases.tenantId, knowledgeBases.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "chunk_embeddings_tenant_document_fk",
      columns: [table.tenantId, table.documentId],
      foreignColumns: [documents.tenantId, documents.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "chunk_embeddings_tenant_chunk_fk",
      columns: [table.tenantId, table.chunkId],
      foreignColumns: [documentChunks.tenantId, documentChunks.id],
    }).onDelete("cascade"),
    index("chunk_embeddings_kb_idx").on(table.tenantId, table.knowledgeBaseId),
    index("chunk_embeddings_document_idx").on(table.documentId),
    index("chunk_embeddings_provider_idx").on(table.providerId),
    index("chunk_embeddings_embedding_hnsw_idx").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops"),
    ),
  ],
);
