import {
  modelServiceKindLabels,
  modelServiceKindOrder,
  type ModelServiceKind,
  type ProviderSummary,
} from "../index";
import { getSecretMetadata } from "./provider-secrets";
import type { ProviderConfigRecord } from "../shared/service-types";

export function summarizeConfigs(configs: ProviderConfigRecord[]): ProviderSummary[] {
  return modelServiceKindOrder.map((kind) => {
    const config = configs.find((item) => item.kind === kind) ?? null;
    return summarizeConfig(config, kind);
  });
}

export function summarizeConfig(
  config: ProviderConfigRecord | null,
  fallbackKind?: ModelServiceKind,
): ProviderSummary {
  const kind = config?.kind ?? fallbackKind;
  if (kind === undefined) {
    throw new Error("Missing provider kind.");
  }

  if (config === null) {
    return {
      id: null,
      kind,
      label: modelServiceKindLabels[kind],
      configured: false,
      displayName: null,
      provider: null,
      modelId: null,
      baseUrl: null,
      status: null,
      maskedKey: null,
      keyVersion: null,
      updatedAt: null,
    };
  }

  const secretMetadata = getSecretMetadata(config);

  return {
    id: config.id,
    kind,
    label: modelServiceKindLabels[kind],
    configured: true,
    displayName: config.displayName,
    provider: config.provider,
    modelId: config.modelId,
    baseUrl: config.baseUrl,
    status: config.status,
    maskedKey: secretMetadata.maskedKey,
    keyVersion: secretMetadata.keyVersion,
    updatedAt: config.updatedAt.toISOString(),
  };
}
