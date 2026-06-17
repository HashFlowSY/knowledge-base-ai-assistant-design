import {
  aes256GcmEnvelopeSchema,
  decryptAes256Gcm,
  encryptAes256Gcm,
  maskSecret,
  type Aes256GcmKey,
} from "@kb/security";

import {
  createInternalError,
  createValidationError,
} from "../shared/provider-service-errors";
import type {
  ProviderConfigActor,
  ProviderConfigRecord,
  ProviderConfigRepository,
  ProviderConfigServiceSaveBody,
  ProviderSecretCreateInput,
} from "../shared/service-types";

export const providerSecretPurpose = "provider_api_key" as const;

export async function resolveCandidateApiKey(input: {
  actor: ProviderConfigActor;
  body: ProviderConfigServiceSaveBody;
  encryptionKey: Aes256GcmKey;
  existingConfig: ProviderConfigRecord | null;
  repository: ProviderConfigRepository;
}): Promise<
  {
    ok: true;
    apiKey: string;
    existingPlaintext: string | null;
    source: "existing" | "new";
  }
> {
  if (input.body.apiKey.mode === "plaintext") {
    const existingPlaintext = await decryptExistingApiKey({
      actor: input.actor,
      encryptionKey: input.encryptionKey,
      existingConfig: input.existingConfig,
      repository: input.repository,
    });

    return {
      ok: true,
      apiKey: input.body.apiKey.value,
      existingPlaintext: existingPlaintext.apiKey,
      source: "new",
    };
  }

  if (input.existingConfig === null || input.existingConfig.secretRecordId === null) {
    throw createValidationError(
      "首次配置模型服务必须提供 API Key。",
      "missing_provider_api_key",
    );
  }

  const existingPlaintext = await decryptExistingApiKey({
    actor: input.actor,
    encryptionKey: input.encryptionKey,
    existingConfig: input.existingConfig,
    repository: input.repository,
  });

  if (existingPlaintext.apiKey === null) {
    throw createValidationError(
      "首次配置模型服务必须提供 API Key。",
      "missing_provider_api_key",
    );
  }

  return {
    ok: true,
    apiKey: existingPlaintext.apiKey,
    existingPlaintext: existingPlaintext.apiKey,
    source: "existing",
  };
}

export async function decryptExistingApiKey(input: {
  actor: ProviderConfigActor;
  encryptionKey: Aes256GcmKey;
  existingConfig: ProviderConfigRecord | null;
  repository: ProviderConfigRepository;
}): Promise<{ ok: true; apiKey: string | null }> {
  if (input.existingConfig?.secretRecordId === null || input.existingConfig === null) {
    return {
      ok: true,
      apiKey: null,
    };
  }

  const secret = await input.repository.getSecret({
    secretRecordId: input.existingConfig.secretRecordId,
    tenantId: input.actor.tenant.id,
  });
  if (secret === null) {
    throw createInternalError();
  }

  try {
    const envelope = aes256GcmEnvelopeSchema.parse(JSON.parse(secret.encryptedPayload));
    const apiKey = await decryptAes256Gcm({
      aad: createSecretAad({
        keyVersion: secret.keyVersion,
        secretRecordId: secret.id,
        tenantId: secret.tenantId,
      }),
      envelope,
      key: input.encryptionKey,
    });

    return {
      ok: true,
      apiKey,
    };
  } catch {
    throw createInternalError();
  }
}

export async function createEncryptedSecret(input: {
  actorId: string;
  apiKey: string;
  encryptionKey: Aes256GcmKey;
  existingConfig: ProviderConfigRecord | null;
  tenantId: string;
}): Promise<ProviderSecretCreateInput> {
  const id = crypto.randomUUID();
  const keyVersion = nextKeyVersion(getSecretMetadata(input.existingConfig).keyVersion);
  const encrypted = await encryptAes256Gcm({
    aad: createSecretAad({
      keyVersion,
      secretRecordId: id,
      tenantId: input.tenantId,
    }),
    key: input.encryptionKey,
    keyVersion,
    plaintext: input.apiKey,
  });

  return {
    createdByUserId: input.actorId,
    encryptedPayload: JSON.stringify(encrypted),
    id,
    keyVersion,
    metadata: {
      maskedKey: maskSecret(input.apiKey),
      keyVersion,
    },
    tenantId: input.tenantId,
  };
}

export function getSecretMetadata(config: ProviderConfigRecord | null): {
  keyVersion: string | null;
  maskedKey: string | null;
} {
  if (config === null) {
    return {
      keyVersion: null,
      maskedKey: null,
    };
  }

  return {
    keyVersion: config.keyVersion,
    maskedKey: config.maskedKey,
  };
}

export function getMetadataString(
  metadata: Record<string, unknown> | null,
  key: string,
): string | null {
  const value = metadata?.[key];
  return typeof value === "string" ? value : null;
}

function nextKeyVersion(current: string | null): string {
  if (current === null) {
    return "v1";
  }

  const match = /^v(\d+)$/.exec(current);
  if (match === null) {
    return "v1";
  }

  return `v${Number.parseInt(match[1] ?? "1", 10) + 1}`;
}

function createSecretAad(input: {
  keyVersion: string;
  secretRecordId: string;
  tenantId: string;
}): Record<string, string> {
  return {
    keyVersion: input.keyVersion,
    purpose: providerSecretPurpose,
    secretRecordId: input.secretRecordId,
    tenantId: input.tenantId,
  };
}
