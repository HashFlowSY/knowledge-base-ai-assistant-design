import type { ProviderStatus } from "../index";
import { summarizeConfig, summarizeConfigs } from "./provider-config-summary";
import {
  createEncryptedSecret,
  resolveCandidateApiKey,
} from "./provider-secrets";
import { mapProviderConnectionError } from "../shared/provider-service-errors";
import type {
  ProviderAuditEventInput,
  ProviderConfigService,
  ProviderConfigServiceOptions,
} from "../shared/service-types";

export function createProviderConfigService(
  options: ProviderConfigServiceOptions,
): ProviderConfigService {
  return {
    async listProviderConfigs(input) {
      const configs = await options.repository.listProviderConfigs({
        tenantId: input.actor.tenant.id,
      });

      return {
        ok: true,
        providers: summarizeConfigs(configs),
      };
    },
    async saveProviderConfig(input) {
      const existingConfig = await options.repository.getProviderConfig({
        kind: input.kind,
        tenantId: input.actor.tenant.id,
      });
      const keyResult = await resolveCandidateApiKey({
        actor: input.actor,
        body: input.body,
        encryptionKey: options.encryptionKey,
        existingConfig,
        repository: options.repository,
      });
      if (!keyResult.ok) {
        return keyResult;
      }

      const connectionResult = await options.connectionTester({
        apiKey: keyResult.apiKey,
        baseUrl: input.body.baseUrl,
        kind: input.kind,
        modelId: input.body.modelId,
        provider: input.body.provider,
        requestId: input.requestId,
        tenantId: input.actor.tenant.id,
      });
      const safeConnectionMetadata = {
        kind: input.kind,
        provider: input.body.provider,
        modelId: input.body.modelId,
        status: input.body.status,
        ok: connectionResult.ok,
      };
      await recordAudit(options, {
        action: "provider_config.connection_tested",
        actorId: input.actor.user.id,
        metadata: safeConnectionMetadata,
        requestId: input.requestId,
        ipSummary: input.ipSummary ?? null,
        targetId: existingConfig?.id ?? input.kind,
        tenantId: input.actor.tenant.id,
        userAgentSummary: input.userAgentSummary ?? null,
      });
      if (!connectionResult.ok) {
        return mapProviderConnectionError(connectionResult.code);
      }

      const shouldRotateSecret =
        keyResult.source === "new" &&
        (keyResult.existingPlaintext === null ||
          keyResult.existingPlaintext !== keyResult.apiKey);
      const nextSecret =
        shouldRotateSecret || existingConfig === null
          ? await createEncryptedSecret({
              actorId: input.actor.user.id,
              apiKey: keyResult.apiKey,
              encryptionKey: options.encryptionKey,
              existingConfig,
              tenantId: input.actor.tenant.id,
            })
          : null;
      const saved = await options.repository.saveProviderConfig({
        actorId: input.actor.user.id,
        baseUrl: input.body.baseUrl,
        displayName: input.body.displayName,
        kind: input.kind,
        modelId: input.body.modelId,
        provider: input.body.provider,
        secret: nextSecret,
        status: input.body.status,
        tenantId: input.actor.tenant.id,
      });
      const summary = summarizeConfig(saved.config);
      const mutationAction = getMutationAuditAction({
        created: saved.created,
        keyRotated: nextSecret !== null && existingConfig !== null,
        status: input.body.status,
      });
      await recordAudit(options, {
        action: mutationAction,
        actorId: input.actor.user.id,
        metadata: {
          kind: input.kind,
          provider: input.body.provider,
          modelId: input.body.modelId,
          status: input.body.status,
          keyRotated: nextSecret !== null && existingConfig !== null,
        },
        requestId: input.requestId,
        ipSummary: input.ipSummary ?? null,
        targetId: saved.config.id,
        tenantId: input.actor.tenant.id,
        userAgentSummary: input.userAgentSummary ?? null,
      });

      return {
        ok: true,
        provider: summary,
      };
    },
  };
}

function getMutationAuditAction(input: {
  created: boolean;
  keyRotated: boolean;
  status: ProviderStatus;
}): ProviderAuditEventInput["action"] {
  if (input.status === "disabled") {
    return "provider_config.disabled";
  }

  if (input.keyRotated) {
    return "provider_config.key_rotated";
  }

  return input.created ? "provider_config.created" : "provider_config.updated";
}

async function recordAudit(
  options: ProviderConfigServiceOptions,
  input: ProviderAuditEventInput,
): Promise<void> {
  await options.auditRecorder?.(input);
}
