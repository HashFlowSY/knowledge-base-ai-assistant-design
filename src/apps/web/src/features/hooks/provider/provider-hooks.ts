"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  providerListResponseSchema,
  providerPublicKeySchema,
  providerSummarySchema,
  saveProviderConfigInputSchema,
  type ModelServiceKind,
  type ProviderApiKeyInput,
  type ProviderListResponse,
  type ProviderPublicKey,
  type ProviderSummary,
  type ProviderStatus,
  type SaveProviderConfigInput,
} from "@kb/ai-providers";
import { encryptRsaOaep } from "@kb/security";

import { apiClient, parseApiClientResponse } from "@/features/api/client";

export const providersQueryKey = ["providers"] as const;

export interface ProviderFormValues {
  displayName: string;
  provider: string;
  modelId: string;
  baseUrl: string;
  status: ProviderStatus;
  apiKey: string;
}

export interface SaveProviderConfigFormInput extends ProviderFormValues {
  kind: ModelServiceKind;
}

export function useProviders() {
  return useQuery({
    queryKey: providersQueryKey,
    queryFn: async () => {
      const response = await parseApiClientResponse<ProviderListResponse>({
        dataSchema: providerListResponseSchema,
        response: await apiClient.api.providers.$get({}),
      });

      return response.data.providers;
    },
  });
}

export function useSaveProviderConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: SaveProviderConfigFormInput): Promise<ProviderSummary> => {
      const body = await createProviderSaveBodyWithTransportKey(input);
      const response = await parseApiClientResponse<ProviderSummary>({
        dataSchema: providerSummarySchema,
        response: await apiClient.api.providers[":kind"].$put({
          json: body,
          param: { kind: input.kind },
        }),
      });

      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: providersQueryKey });
    },
  });
}

export function createProviderSaveBody(
  input: ProviderFormValues & { encryptedApiKey?: ProviderApiKeyInput },
): SaveProviderConfigInput {
  const apiKey =
    input.encryptedApiKey ??
    ({
      mode: "keep",
    } as const);

  return saveProviderConfigInputSchema.parse({
    apiKey,
    baseUrl: input.baseUrl.trim(),
    displayName: input.displayName.trim(),
    modelId: input.modelId.trim(),
    provider: input.provider.trim(),
    status: input.status,
  });
}

export async function createEncryptedProviderApiKeyInput(input: {
  apiKey: string;
  publicKey: ProviderPublicKey;
}): Promise<Extract<ProviderApiKeyInput, { mode: "encrypted" }>> {
  return {
    mode: "encrypted",
    keyId: input.publicKey.keyId,
    ciphertext: await encryptRsaOaep({
      plaintext: input.apiKey,
      publicKey: input.publicKey.publicKey,
    }),
  };
}

async function createProviderSaveBodyWithTransportKey(
  input: SaveProviderConfigFormInput,
): Promise<SaveProviderConfigInput> {
  const trimmedApiKey = input.apiKey.trim();
  if (trimmedApiKey.length === 0) {
    return createProviderSaveBody(input);
  }

  const publicKeyResponse = await parseApiClientResponse<ProviderPublicKey>({
    dataSchema: providerPublicKeySchema,
    response: await apiClient.api.providers["public-key"].$get({}),
  });
  const encryptedApiKey = await createEncryptedProviderApiKeyInput({
    apiKey: trimmedApiKey,
    publicKey: publicKeyResponse.data,
  });

  return createProviderSaveBody({
    ...input,
    encryptedApiKey,
  });
}
