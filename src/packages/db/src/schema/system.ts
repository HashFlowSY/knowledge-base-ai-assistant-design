import {
  index,
  jsonb,
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

export const systemSettings = pgTable(
  "system_settings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, {
        onDelete: "cascade",
      }),
    key: varchar("key", { length: 160 }).notNull(),
    value: jsonb("value").$type<Record<string, unknown>>()
      .notNull()
      .default(emptyJsonObject),
    description: text("description"),
    updatedByUserId: text("updated_by_user_id").references(() => authUsers.id, {
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
    uniqueIndex("system_settings_tenant_key_idx").on(table.tenantId, table.key),
    index("system_settings_tenant_idx").on(table.tenantId),
  ],
);
