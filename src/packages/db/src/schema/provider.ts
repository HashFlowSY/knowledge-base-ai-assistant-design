import { sql } from "drizzle-orm";
import {
  boolean,
  foreignKey,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { authUsers } from "./auth";
import { emptyJsonObject } from "./common";
import { tenants } from "./tenant";

export const providerKindEnum = pgEnum("provider_kind", [
  "chat",
  "embedding",
  "rerank",
]);

export const providerStatusEnum = pgEnum("provider_status", [
  "enabled",
  "disabled",
]);

export const secretPurposeEnum = pgEnum("secret_purpose", ["provider_api_key"]);

export const secretRecords = pgTable(
  "secret_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    purpose: secretPurposeEnum("purpose").notNull(),
    encryptedPayload: text("encrypted_payload").notNull(),
    keyVersion: varchar("key_version", { length: 80 }).notNull().default("v1"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>()
      .notNull()
      .default(emptyJsonObject),
    createdByUserId: text("created_by_user_id").references(() => authUsers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("secret_records_tenant_idx").on(table.tenantId),
    uniqueIndex("secret_records_tenant_id_id_idx").on(table.tenantId, table.id),
    index("secret_records_purpose_idx").on(table.tenantId, table.purpose),
  ],
);

export const providerConfigs = pgTable(
  "provider_configs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    kind: providerKindEnum("kind").notNull(),
    provider: varchar("provider", { length: 120 }).notNull(),
    modelId: varchar("model_id", { length: 200 }).notNull(),
    displayName: varchar("display_name", { length: 200 }).notNull(),
    status: providerStatusEnum("status").notNull().default("enabled"),
    isDefault: boolean("is_default").notNull().default(false),
    secretRecordId: uuid("secret_record_id").references(() => secretRecords.id, {
      onDelete: "set null",
    }),
    settings: jsonb("settings").$type<Record<string, unknown>>()
      .notNull()
      .default(emptyJsonObject),
    createdByUserId: text("created_by_user_id").references(() => authUsers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("provider_configs_tenant_kind_default_idx")
      .on(table.tenantId, table.kind, table.isDefault)
      .where(sql`${table.isDefault} = true`),
    uniqueIndex("provider_configs_tenant_id_id_idx").on(table.tenantId, table.id),
    foreignKey({
      name: "provider_configs_tenant_secret_fk",
      columns: [table.tenantId, table.secretRecordId],
      foreignColumns: [secretRecords.tenantId, secretRecords.id],
    }),
    index("provider_configs_tenant_idx").on(table.tenantId),
    index("provider_configs_kind_status_idx").on(
      table.tenantId,
      table.kind,
      table.status,
    ),
  ],
);
