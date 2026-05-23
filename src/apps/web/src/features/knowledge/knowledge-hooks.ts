"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";

import {
  createKnowledgeBaseInputSchema,
  documentFileUploadResultSchema,
  knowledgeBaseDetailSchema,
  knowledgeBasesPageSchema,
  knowledgeBaseSummarySchema,
  updateKnowledgeBaseInputSchema,
  type CreateKnowledgeBaseInput,
  type DocumentFileUploadResult,
  type KnowledgeBaseDetail,
  type KnowledgeBaseListQuery,
  type KnowledgeBasesPage,
  type KnowledgeBaseSummary,
  type UpdateKnowledgeBaseInput,
} from "@kb/knowledge";

import { apiClient, parseApiClientResponse } from "../api/client";

export type KnowledgeBaseInfiniteListQuery = Omit<KnowledgeBaseListQuery, "page">;

export interface UploadDocumentFileInput {
  file: File;
  knowledgeBaseId: string;
  title: string;
}

export const knowledgeBasesQueryKey = (input: KnowledgeBaseListQuery) =>
  ["knowledge-bases", input] as const;

export const infiniteKnowledgeBasesQueryKey = (input: KnowledgeBaseInfiniteListQuery) =>
  ["knowledge-bases", "infinite", input] as const;

export const knowledgeBaseQueryKey = (knowledgeBaseId: string | null) =>
  ["knowledge-bases", knowledgeBaseId] as const;

async function fetchKnowledgeBases(input: KnowledgeBaseListQuery): Promise<KnowledgeBasesPage> {
  const response = await parseApiClientResponse<KnowledgeBasesPage>({
    dataSchema: knowledgeBasesPageSchema,
    response: await apiClient.api["knowledge-bases"].$get({
      query: {
        page: input.page.toString(),
        pageSize: input.pageSize.toString(),
        sort: input.sort,
        ...(input.search === undefined ? {} : { search: input.search }),
      },
    }),
  });

  return response.data;
}

export function useKnowledgeBases(input: KnowledgeBaseListQuery) {
  return useQuery({
    queryKey: knowledgeBasesQueryKey(input),
    queryFn: () => fetchKnowledgeBases(input),
    placeholderData: (previousData) => previousData,
  });
}

export function useInfiniteKnowledgeBases(input: KnowledgeBaseInfiniteListQuery) {
  return useInfiniteQuery<
    KnowledgeBasesPage,
    Error,
    InfiniteData<KnowledgeBasesPage>,
    ReturnType<typeof infiniteKnowledgeBasesQueryKey>,
    number
  >({
    getNextPageParam: (lastPage) => {
      const loadedCount = lastPage.page * lastPage.pageSize;

      return loadedCount < lastPage.total ? lastPage.page + 1 : undefined;
    },
    initialPageParam: 1,
    queryFn: ({ pageParam }) => fetchKnowledgeBases({ ...input, page: pageParam }),
    queryKey: infiniteKnowledgeBasesQueryKey(input),
  });
}

export function useKnowledgeBase(knowledgeBaseId: string | null) {
  return useQuery({
    enabled: typeof knowledgeBaseId === "string" && knowledgeBaseId.length > 0,
    queryKey: knowledgeBaseQueryKey(knowledgeBaseId),
    queryFn: async () => {
      if (knowledgeBaseId === null || knowledgeBaseId.length === 0) {
        throw new Error("Missing knowledge base id.");
      }

      const response = await parseApiClientResponse<KnowledgeBaseDetail>({
        dataSchema: knowledgeBaseDetailSchema,
        response: await apiClient.api["knowledge-bases"][":knowledgeBaseId"].$get({
          param: { knowledgeBaseId },
        }),
      });

      return response.data;
    },
  });
}

export function useCreateKnowledgeBase() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateKnowledgeBaseInput) => {
      const body = createKnowledgeBaseInputSchema.parse(input);
      const response = await parseApiClientResponse<KnowledgeBaseSummary>({
        dataSchema: knowledgeBaseSummarySchema,
        response: await apiClient.api["knowledge-bases"].$post({ json: body }),
      });

      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["knowledge-bases"] });
    },
  });
}

export function useUpdateKnowledgeBase(knowledgeBaseId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateKnowledgeBaseInput) => {
      if (knowledgeBaseId === null || knowledgeBaseId.length === 0) {
        throw new Error("Missing knowledge base id.");
      }

      const body = updateKnowledgeBaseInputSchema.parse(input);
      const response = await parseApiClientResponse<KnowledgeBaseDetail>({
        dataSchema: knowledgeBaseDetailSchema,
        response: await apiClient.api["knowledge-bases"][":knowledgeBaseId"].$patch({
          json: body,
          param: { knowledgeBaseId },
        }),
      });

      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["knowledge-bases"] });
      if (knowledgeBaseId !== null && knowledgeBaseId.length > 0) {
        queryClient.invalidateQueries({
          queryKey: knowledgeBaseQueryKey(knowledgeBaseId),
        });
      }
    },
  });
}

export function useUploadDocumentFile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      input: UploadDocumentFileInput,
    ): Promise<DocumentFileUploadResult> => {
      const title = input.title.trim();
      const response = await parseApiClientResponse<DocumentFileUploadResult>({
        dataSchema: documentFileUploadResultSchema,
        response: await apiClient.api["knowledge-bases"][
          ":knowledgeBaseId"
        ].documents.upload.$post({
          form:
            title.length === 0
              ? { file: input.file }
              : { file: input.file, title },
          param: { knowledgeBaseId: input.knowledgeBaseId },
        }),
      });

      return response.data;
    },
    onSuccess: (_result, input) => {
      queryClient.invalidateQueries({ queryKey: ["knowledge-bases"] });
      queryClient.invalidateQueries({
        queryKey: knowledgeBaseQueryKey(input.knowledgeBaseId),
      });
    },
  });
}
