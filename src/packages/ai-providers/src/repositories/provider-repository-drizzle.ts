import { and, eq, sql } from "drizzle-orm";

import { providerConfigs, secretRecords, type ProjectDb } from "@kb/db";

import {
  getMetadataString,
  providerSecretPurpose,
} from "../provider-config/provider-secrets";
import type {
  ProviderConfigRecord,
  ProviderConfigRepository,
  ProviderSecretCreateInput,
  ProviderSecretRecord,
} from "../shared/service-types";

export function createDrizzleProviderConfigRepository(
  db: ProjectDb,
): ProviderConfigRepository {
  return {
    async listProviderConfigs(input) {
      const rows = await db
        .select({
          config: providerConfigs,
          secret: secretRecords,
        })
        .from(providerConfigs)
        .leftJoin(
          secretRecords,
          and(
            eq(providerConfigs.tenantId, secretRecords.tenantId),
            eq(providerConfigs.secretRecordId, secretRecords.id),
          ),
        )
        .where(eq(providerConfigs.tenantId, input.tenantId));

      return rows.map((row) => mapProviderConfigRow(row.config, row.secret));
    },
    async getProviderConfig(input) {
      const rows = await db
        .select({
          config: providerConfigs,
          secret: secretRecords,
        })
        .from(providerConfigs)
        .leftJoin(
          secretRecords,
          and(
            eq(providerConfigs.tenantId, secretRecords.tenantId),
            eq(providerConfigs.secretRecordId, secretRecords.id),
          ),
        )
        .where(
          and(
            eq(providerConfigs.tenantId, input.tenantId),
            eq(providerConfigs.kind, input.kind),
          ),
        )
        .limit(1);

      const row = rows[0];
      return row === undefined ? null : mapProviderConfigRow(row.config, row.secret);
    },
    async getSecret(input) {
      const rows = await db
        .select()
        .from(secretRecords)
        .where(
          and(
            eq(secretRecords.tenantId, input.tenantId),
            eq(secretRecords.id, input.secretRecordId),
          ),
        )
        .limit(1);
      const row = rows[0];

      return row === undefined ? null : mapSecretRow(row);
    },
    async saveProviderConfig(input) {
      return db.transaction(async (tx) => {
        if (input.secret !== null) {
          await tx.insert(secretRecords).values({
            createdByUserId: input.secret.createdByUserId,
            encryptedPayload: input.secret.encryptedPayload,
            id: input.secret.id,
            keyVersion: input.secret.keyVersion,
            metadata: input.secret.metadata,
            purpose: providerSecretPurpose,
            tenantId: input.secret.tenantId,
          });
        }

        const existingRows = await tx
          .select()
          .from(providerConfigs)
          .where(
            and(
              eq(providerConfigs.tenantId, input.tenantId),
              eq(providerConfigs.kind, input.kind),
            ),
          )
          .limit(1);
        const existing = existingRows[0] ?? null;
        const secretRecordId = input.secret?.id ?? existing?.secretRecordId ?? null;
        const configRows =
          existing === null
            ? await tx
                .insert(providerConfigs)
                .values({
                  baseUrl: input.baseUrl,
                  createdByUserId: input.actorId,
                  displayName: input.displayName,
                  kind: input.kind,
                  modelId: input.modelId,
                  provider: input.provider,
                  secretRecordId,
                  status: input.status,
                  tenantId: input.tenantId,
                })
                .returning()
            : await tx
                .update(providerConfigs)
                .set({
                  baseUrl: input.baseUrl,
                  displayName: input.displayName,
                  modelId: input.modelId,
                  provider: input.provider,
                  secretRecordId,
                  status: input.status,
                  updatedAt: sql`NOW()`,
                })
                .where(eq(providerConfigs.id, existing.id))
                .returning();
        const config = configRows[0];
        if (config === undefined) {
          throw new Error("Provider config save failed.");
        }

        const secret =
          input.secret === null && secretRecordId !== null
            ? ((
                await tx
                  .select()
                  .from(secretRecords)
                  .where(
                    and(
                      eq(secretRecords.tenantId, input.tenantId),
                      eq(secretRecords.id, secretRecordId),
                    ),
                  )
                  .limit(1)
              )[0] ?? null)
            : input.secret;

        return {
          config: mapProviderConfigRow(config, secret),
          created: existing === null,
        };
      });
    },
  };
}

function mapProviderConfigRow(
  config: typeof providerConfigs.$inferSelect,
  secret: typeof secretRecords.$inferSelect | ProviderSecretCreateInput | null,
): ProviderConfigRecord {
  return {
    baseUrl: config.baseUrl,
    displayName: config.displayName,
    id: config.id,
    keyVersion: secret?.keyVersion ?? null,
    kind: config.kind,
    maskedKey: getMetadataString(secret?.metadata ?? null, "maskedKey"),
    modelId: config.modelId,
    provider: config.provider,
    secretRecordId: config.secretRecordId,
    status: config.status,
    tenantId: config.tenantId,
    updatedAt: config.updatedAt,
  };
}

function mapSecretRow(row: typeof secretRecords.$inferSelect): ProviderSecretRecord {
  return {
    encryptedPayload: row.encryptedPayload,
    id: row.id,
    keyVersion: row.keyVersion,
    metadata: row.metadata,
    tenantId: row.tenantId,
  };
}
