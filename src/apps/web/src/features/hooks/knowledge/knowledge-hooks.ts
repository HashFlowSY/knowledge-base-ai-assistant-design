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
  documentProcessingPageSchema,
  knowledgeBaseDetailSchema,
  knowledgeBasesPageSchema,
  knowledgeBaseSummarySchema,
  retryDocumentProcessingResultSchema,
  updateKnowledgeBaseInputSchema,
  type CreateKnowledgeBaseInput,
  type DocumentFileUploadResult,
  type DocumentProcessingListQuery,
  type DocumentProcessingPage,
  type KnowledgeBaseDetail,
  type KnowledgeBaseListQuery,
  type KnowledgeBasesPage,
  type KnowledgeBaseSummary,
  type RetryDocumentProcessingResult,
  type UpdateKnowledgeBaseInput,
} from "@kb/knowledge";

import { apiClient, parseApiClientResponse } from "../../api/client";
import { isActiveDocumentProcessingStatus } from "../../knowledge/document-processing-state";

export type KnowledgeBaseInfiniteListQuery = Omit<KnowledgeBaseListQuery, "page">;
export type DocumentProcessingInfiniteListQuery = Omit<
  DocumentProcessingListQuery,
  "page"
>;

export interface UploadDocumentFileInput {
  file: File;
  knowledgeBaseId: string;
  title: string;
}

export interface RetryDocumentProcessingInput {
  documentId: string;
  knowledgeBaseId: string;
}

export const knowledgeBasesQueryKey = (input: KnowledgeBaseListQuery) =>
  ["knowledge-bases", input] as const;

export const infiniteKnowledgeBasesQueryKey = (input: KnowledgeBaseInfiniteListQuery) =>
  ["knowledge-bases", "infinite", input] as const;

export const knowledgeBaseQueryKey = (knowledgeBaseId: string | null) =>
  ["knowledge-bases", knowledgeBaseId] as const;

export const knowledgeBaseDocumentRetryMutationKey = (
  knowledgeBaseId: string,
  documentId: string,
) =>
  ["knowledge-bases", knowledgeBaseId, "documents", documentId, "retry"] as const;

export const documentProcessingQueryRootKey = (knowledgeBaseId: string | null) =>
  ["knowledge-bases", knowledgeBaseId, "documents", "processing"] as const;

export const infiniteDocumentProcessingQueryKey = (
  knowledgeBaseId: string | null,
  input: DocumentProcessingInfiniteListQuery,
) =>
  [...documentProcessingQueryRootKey(knowledgeBaseId), "infinite", input] as const;

async function fetchKnowledgeBases(
  input: KnowledgeBaseListQuery,
): Promise<KnowledgeBasesPage> {
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

async function fetchDocumentProcessing(input: {
  knowledgeBaseId: string;
  page: number;
  pageSize: number;
}): Promise<DocumentProcessingPage> {
  const response = await parseApiClientResponse<DocumentProcessingPage>({
    dataSchema: documentProcessingPageSchema,
    response: await apiClient.api["knowledge-bases"][
      ":knowledgeBaseId"
    ].documents.processing.$get({
      param: { knowledgeBaseId: input.knowledgeBaseId },
      query: {
        page: input.page.toString(),
        pageSize: input.pageSize.toString(),
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

export function useInfiniteDocumentProcessing(
  knowledgeBaseId: string | null,
  input: DocumentProcessingInfiniteListQuery = { pageSize: 8 },
) {
  return useInfiniteQuery<
    DocumentProcessingPage,
    Error,
    InfiniteData<DocumentProcessingPage>,
    ReturnType<typeof infiniteDocumentProcessingQueryKey>,
    number
  >({
    enabled: typeof knowledgeBaseId === "string" && knowledgeBaseId.length > 0,
    getNextPageParam: (lastPage) => {
      const loadedCount = lastPage.page * lastPage.pageSize;

      return loadedCount < lastPage.total ? lastPage.page + 1 : undefined;
    },
    initialPageParam: 1,
    queryFn: ({ pageParam }) => {
      if (knowledgeBaseId === null || knowledgeBaseId.length === 0) {
        throw new Error("Missing knowledge base id.");
      }

      return fetchDocumentProcessing({
        knowledgeBaseId,
        page: pageParam,
        pageSize: input.pageSize,
      });
    },
    queryKey: infiniteDocumentProcessingQueryKey(knowledgeBaseId, input),
    refetchInterval: (query) =>
      hasActiveDocumentProcessingPages(query.state.data) ? 3_000 : false,
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
      queryClient.invalidateQueries({
        queryKey: documentProcessingQueryRootKey(input.knowledgeBaseId),
      });
    },
  });
}

export function useRetryDocumentProcessing() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      input: RetryDocumentProcessingInput,
    ): Promise<RetryDocumentProcessingResult> => {
      const response = await parseApiClientResponse<RetryDocumentProcessingResult>({
        dataSchema: retryDocumentProcessingResultSchema,
        response: await apiClient.api["knowledge-bases"][
          ":knowledgeBaseId"
        ].documents[":documentId"].retry.$post({
          json: {},
          param: {
            documentId: input.documentId,
            knowledgeBaseId: input.knowledgeBaseId,
          },
        }),
      });

      return response.data;
    },
    mutationKey: ["knowledge-bases", "documents", "retry"],
    onSuccess: (result, input) => {
      queryClient.setQueriesData<InfiniteData<DocumentProcessingPage>>(
        { queryKey: documentProcessingQueryRootKey(input.knowledgeBaseId) },
        (data) => replaceDocumentProcessingDocument(data, result.document),
      );
      queryClient.invalidateQueries({ queryKey: ["knowledge-bases"] });
      queryClient.invalidateQueries({
        queryKey: knowledgeBaseQueryKey(input.knowledgeBaseId),
      });
      queryClient.invalidateQueries({
        queryKey: documentProcessingQueryRootKey(input.knowledgeBaseId),
      });
    },
  });
}

export function replaceDocumentProcessingDocument(
  data: InfiniteData<DocumentProcessingPage> | undefined,
  document: RetryDocumentProcessingResult["document"],
): InfiniteData<DocumentProcessingPage> | undefined {
  if (data === undefined) {
    return data;
  }

  let changed = false;
  const pages = data.pages.map((page) => {
    let pageChanged = false;
    const items = page.items.map((item) => {
      if (item.id !== document.id) {
        return item;
      }

      changed = true;
      pageChanged = true;
      return document;
    });

    return pageChanged ? { ...page, items } : page;
  });

  return changed ? { ...data, pages } : data;
}

export function hasActiveDocumentProcessing(
  page: DocumentProcessingPage | undefined,
): boolean {
  return (
    page?.items.some((document) => {
      if (document.job !== null) {
        return isActiveDocumentProcessingStatus(document.job.status);
      }

      return document.status === "pending" || document.status === "processing";
    }) ?? false
  );
}

export function hasActiveDocumentProcessingPages(
  data: InfiniteData<DocumentProcessingPage> | undefined,
): boolean {
  return data?.pages.some((page) => hasActiveDocumentProcessing(page)) ?? false;
}
