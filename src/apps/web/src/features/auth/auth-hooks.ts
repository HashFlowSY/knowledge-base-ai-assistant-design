"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { sessionPayloadSchema, type LoginInput, type SessionPayload } from "@kb/auth";
import { emptyPayloadSchema } from "@kb/shared";

import { apiClient, parseApiClientResponse } from "../api/client";

export const authQueryKey = ["auth", "session"] as const;

export function useSessionQuery() {
  return useQuery({
    queryKey: authQueryKey,
    queryFn: async () => {
      const response = await parseApiClientResponse<SessionPayload>({
        dataSchema: sessionPayloadSchema,
        response: await apiClient.api.auth.session.$get({}),
      });

      return response.data;
    },
  });
}

export function useLoginMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: LoginInput) => {
      const response = await parseApiClientResponse<SessionPayload>({
        dataSchema: sessionPayloadSchema,
        response: await apiClient.api.auth.login.$post({ json: input }),
      });

      return response.data;
    },
    onSuccess: (session) => {
      queryClient.setQueryData(authQueryKey, session);
    },
  });
}

export function useLogoutMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      await parseApiClientResponse<null>({
        dataSchema: emptyPayloadSchema,
        response: await apiClient.api.auth.logout.$post({}),
      });
    },
    onSettled: () => {
      queryClient.clear();
    },
  });
}
