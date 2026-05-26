import { z } from "zod";

export * from "./query";

export const searchBackendSchema = z.enum(["meilisearch", "pgvector"]);

export type SearchBackend = z.infer<typeof searchBackendSchema>;

export const authorizedSearchScopeSchema = z.object({
  tenantId: z.string().min(1),
  knowledgeBaseIds: z.array(z.string().min(1)).min(1),
});

export type AuthorizedSearchScope = z.infer<typeof authorizedSearchScopeSchema>;

export const searchIndexDocumentSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  knowledgeBaseId: z.string().min(1),
  documentId: z.string().min(1),
  documentVersion: z.number().int().positive(),
  chunkId: z.string().min(1),
  chunkIndex: z.number().int().min(0),
  content: z.string().min(1),
  sourceLocator: z.string().min(1).nullable(),
  metadata: z.record(z.unknown()),
});

export type SearchIndexDocument = z.infer<typeof searchIndexDocumentSchema>;

export type SearchIndexDocumentInput = Omit<SearchIndexDocument, "id">;

export function createSearchIndexDocumentId(input: {
  tenantId: string;
  knowledgeBaseId: string;
  documentId: string;
  documentVersion: number;
  chunkIndex: number;
}): string {
  return [
    createMeiliSafeIdComponent(input.tenantId),
    createMeiliSafeIdComponent(input.knowledgeBaseId),
    createMeiliSafeIdComponent(input.documentId),
    input.documentVersion.toString(),
    input.chunkIndex.toString(),
  ].join("__");
}

export function createSearchIndexDocument(
  input: SearchIndexDocumentInput,
): SearchIndexDocument {
  return searchIndexDocumentSchema.parse({
    ...input,
    id: createSearchIndexDocumentId(input),
  });
}

export interface SearchIndexWriter {
  indexDocuments(input: { documents: SearchIndexDocument[] }): Promise<void>;
}

export interface MeiliSearchIndexWriterOptions {
  host: string;
  apiKey: string;
  indexUid?: string;
  fetcher?: typeof fetch;
  filterableAttributes?: string[];
  maxTaskPollAttempts?: number;
  taskPollIntervalMs?: number;
}

export function createMeiliSearchIndexWriter(
  options: MeiliSearchIndexWriterOptions,
): SearchIndexWriter {
  const indexUid = options.indexUid ?? "kb_chunks";
  const fetcher = options.fetcher ?? fetch;
  const host = options.host.replace(/\/+$/, "");
  const filterableAttributes = options.filterableAttributes ?? [
    "tenantId",
    "knowledgeBaseId",
    "documentId",
    "chunkId",
  ];
  const maxTaskPollAttempts = options.maxTaskPollAttempts ?? 40;
  const taskPollIntervalMs = options.taskPollIntervalMs ?? 250;
  let settingsReady: Promise<void> | null = null;

  return {
    async indexDocuments(input) {
      if (input.documents.length === 0) {
        return;
      }

      settingsReady ??= configureFilterableAttributes();
      await settingsReady;

      const response = await fetcher(
        `${host}/indexes/${indexUid}/documents?primaryKey=id`,
        {
          body: JSON.stringify(input.documents),
          headers: {
            authorization: `Bearer ${options.apiKey}`,
            "content-type": "application/json",
          },
          method: "POST",
        },
      );
      if (!response.ok) {
        throw new Error("Search index write failed.");
      }

      await waitForTask(await readTaskUid(response, "Search index write failed."));
    },
  };

  async function configureFilterableAttributes(): Promise<void> {
    try {
      const response = await fetcher(
        `${host}/indexes/${indexUid}/settings/filterable-attributes`,
        {
          body: JSON.stringify(filterableAttributes),
          headers: {
            authorization: `Bearer ${options.apiKey}`,
            "content-type": "application/json",
          },
          method: "PUT",
        },
      );
      if (!response.ok) {
        throw new Error("Search index settings update failed.");
      }

      await waitForTask(
        await readTaskUid(response, "Search index settings update failed."),
      );
    } catch (error) {
      settingsReady = null;
      throw error;
    }
  }

  async function waitForTask(taskUid: string | number): Promise<void> {
    for (let attempt = 0; attempt < maxTaskPollAttempts; attempt += 1) {
      const response = await fetcher(`${host}/tasks/${taskUid}`, {
        headers: {
          authorization: `Bearer ${options.apiKey}`,
        },
        method: "GET",
      });
      if (!response.ok) {
        throw new Error("Search index task status check failed.");
      }

      const body = await response.json();
      const status = readTaskStatus(body);
      if (status === "succeeded") {
        return;
      }
      if (status === "failed" || status === "canceled") {
        throw new Error(`Search index task failed: ${readTaskErrorMessage(body)}`);
      }

      await delay(taskPollIntervalMs);
    }

    throw new Error("Search index task timed out.");
  }
}

async function readTaskUid(
  response: Response,
  errorMessage: string,
): Promise<string | number> {
  const body = await response.json();
  if (
    typeof body === "object" &&
    body !== null &&
    "taskUid" in body &&
    (typeof body.taskUid === "string" || typeof body.taskUid === "number")
  ) {
    return body.taskUid;
  }

  throw new Error(errorMessage);
}

function readTaskStatus(value: unknown): string {
  if (
    typeof value === "object" &&
    value !== null &&
    "status" in value &&
    typeof value.status === "string"
  ) {
    return value.status;
  }

  return "unknown";
}

function readTaskErrorMessage(value: unknown): string {
  if (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof value.error === "object" &&
    value.error !== null &&
    "message" in value.error &&
    typeof value.error.message === "string"
  ) {
    return value.error.message;
  }

  return "unknown error";
}

function createMeiliSafeIdComponent(value: string): string {
  const normalized = value.replace(/[^A-Za-z0-9_-]+/g, "_").replace(/_+/g, "_");

  return normalized.length === 0 ? "_" : normalized;
}

async function delay(milliseconds: number): Promise<void> {
  if (milliseconds <= 0) {
    return;
  }

  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}
