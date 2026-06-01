"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createUserInputSchema,
  updateUserInputSchema,
  userSummarySchema,
  usersPageSchema,
  type CreateUserInput,
  type ListUsersQuery,
  type UpdateUserInput,
  type UserSummary,
  type UsersPage,
} from "@kb/users";
import { emptyPayloadSchema } from "@kb/shared";

import { apiClient, parseApiClientResponse } from "@/features/api/client";

export const usersQueryKey = (input: ListUsersQuery) => ["users", input] as const;

export function useUsers(input: ListUsersQuery) {
  return useQuery({
    queryKey: usersQueryKey(input),
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("page", input.page.toString());
      params.set("pageSize", input.pageSize.toString());
      params.set("filter", input.filter);
      params.set("sort", input.sort);
      if (input.search !== undefined) {
        params.set("search", input.search);
      }

      const response = await parseApiClientResponse<UsersPage>({
        dataSchema: usersPageSchema,
        response: await apiClient.api.users.$get({
          query: Object.fromEntries(params),
        }),
      });

      return response.data;
    },
    placeholderData: (previousData) => previousData,
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateUserInput) => {
      const body = createUserInputSchema.parse(input);
      const response = await parseApiClientResponse<UserSummary>({
        dataSchema: userSummarySchema,
        response: await apiClient.api.users.$post({ json: body }),
      });

      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

export function useUpdateUser(userId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateUserInput) => {
      if (userId === null) {
        throw new Error("Missing user id.");
      }

      const body = updateUserInputSchema.parse(input);
      const response = await parseApiClientResponse<UserSummary>({
        dataSchema: userSummarySchema,
        response: await apiClient.api.users[":userId"].$patch({
          json: body,
          param: { userId },
        }),
      });

      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

export function useRemoveUserAccess() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (userId: string) => {
      await parseApiClientResponse<null>({
        dataSchema: emptyPayloadSchema,
        response: await apiClient.api.users[":userId"].access.$delete({
          param: { userId },
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
}
