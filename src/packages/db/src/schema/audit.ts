import {
  index,
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
import { tenants } from "./tenant";

export const auditActorTypeEnum = pgEnum("audit_actor_type", [
  "user",
  "system",
]);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    actorId: text("actor_id").references(() => authUsers.id, {
      onDelete: "set null",
    }),
    actorType: auditActorTypeEnum("actor_type").notNull(),
    action: varchar("action", { length: 160 }).notNull(),
    targetType: varchar("target_type", { length: 120 }).notNull(),
    targetId: text("target_id").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>()
      .notNull()
      .default(emptyJsonObject),
    requestId: varchar("request_id", { length: 120 }),
    ipSummary: varchar("ip_summary", { length: 160 }),
    userAgentSummary: text("user_agent_summary"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("audit_logs_tenant_created_idx").on(table.tenantId, table.createdAt),
    index("audit_logs_actor_idx").on(table.tenantId, table.actorId),
    index("audit_logs_action_idx").on(table.tenantId, table.action),
    index("audit_logs_target_idx").on(
      table.tenantId,
      table.targetType,
      table.targetId,
    ),
    index("audit_logs_request_idx").on(table.requestId),
  ],
);
