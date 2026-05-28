import type { ModelServiceKind } from "../index";
import { getMetadataString } from "../provider-config/provider-secrets";
import type {
  ProviderConfigRecord,
  ProviderConfigRepository,
  ProviderSecretRecord,
} from "../shared/service-types";

export function createInMemoryProviderConfigRepository(): ProviderConfigRepository & {
  inspect(): {
    configs: ProviderConfigRecord[];
    secrets: ProviderSecretRecord[];
  };
} {
  const configs = new Map<string, ProviderConfigRecord>();
  const secrets = new Map<string, ProviderSecretRecord>();

  return {
    async listProviderConfigs(input) {
      return Array.from(configs.values()).filter(
        (config) => config.tenantId === input.tenantId,
      );
    },
    async getProviderConfig(input) {
      return configs.get(configKey(input.tenantId, input.kind)) ?? null;
    },
    async getSecret(input) {
      const secret = secrets.get(input.secretRecordId) ?? null;
      return secret?.tenantId === input.tenantId ? secret : null;
    },
    async saveProviderConfig(input) {
      const key = configKey(input.tenantId, input.kind);
      const existing = configs.get(key) ?? null;

      if (input.secret !== null) {
        secrets.set(input.secret.id, {
          encryptedPayload: input.secret.encryptedPayload,
          id: input.secret.id,
          keyVersion: input.secret.keyVersion,
          metadata: input.secret.metadata,
          tenantId: input.secret.tenantId,
        });
      }

      const config: ProviderConfigRecord = {
        baseUrl: input.baseUrl,
        displayName: input.displayName,
        id: existing?.id ?? `provider_${input.kind}_${configs.size + 1}`,
        keyVersion: input.secret?.keyVersion ?? existing?.keyVersion ?? null,
        kind: input.kind,
        maskedKey:
          getMetadataString(input.secret?.metadata ?? null, "maskedKey") ??
          existing?.maskedKey ??
          null,
        modelId: input.modelId,
        provider: input.provider,
        secretRecordId: input.secret?.id ?? existing?.secretRecordId ?? null,
        status: input.status,
        tenantId: input.tenantId,
        updatedAt: new Date("2026-05-23T00:00:00.000Z"),
      };
      configs.set(key, config);

      return {
        config,
        created: existing === null,
      };
    },
    inspect() {
      return {
        configs: Array.from(configs.values()),
        secrets: Array.from(secrets.values()),
      };
    },
  };
}

function configKey(tenantId: string, kind: ModelServiceKind): string {
  return `${tenantId}:${kind}`;
}
