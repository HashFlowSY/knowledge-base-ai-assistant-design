import { describe, expect, it } from "vitest";

import {
  authorizedSearchScopeSchema,
  createMeiliSearchIndexWriter,
  createSearchIndexDocument,
  createSearchIndexDocumentId,
} from "./index";

describe("@kb/search", () => {
  it("requires tenant and knowledge-base filters for search scopes", () => {
    expect(() =>
      authorizedSearchScopeSchema.parse({
        tenantId: "tenant_1",
        knowledgeBaseIds: [],
      }),
    ).toThrow();
  });

  it("creates stable tenant-scoped search index documents for chunks", () => {
    expect(
      createSearchIndexDocument({
        chunkId: "chunk_1",
        chunkIndex: 3,
        content: "Chunk body",
        documentId: "doc_1",
        documentVersion: 2,
        knowledgeBaseId: "kb_1",
        metadata: { format: "markdown" },
        sourceLocator: "chars:120-220",
        tenantId: "tenant_1",
      }),
    ).toEqual({
      id: "tenant_1__kb_1__doc_1__2__3",
      chunkId: "chunk_1",
      chunkIndex: 3,
      content: "Chunk body",
      documentId: "doc_1",
      documentVersion: 2,
      knowledgeBaseId: "kb_1",
      metadata: { format: "markdown" },
      sourceLocator: "chars:120-220",
      tenantId: "tenant_1",
    });
  });

  it("derives stable search document ids from document version and chunk index", () => {
    expect(
      createSearchIndexDocumentId({
        chunkIndex: 0,
        documentId: "doc_1",
        documentVersion: 1,
        knowledgeBaseId: "kb_1",
        tenantId: "tenant_1",
      }),
    ).toBe("tenant_1__kb_1__doc_1__1__0");
  });

  it("creates Meilisearch-safe document ids", () => {
    const id = createSearchIndexDocumentId({
      chunkIndex: 0,
      documentId: "doc:1",
      documentVersion: 1,
      knowledgeBaseId: "kb/1",
      tenantId: "tenant_1",
    });

    expect(id).toBe("tenant_1__kb_1__doc_1__1__0");
    expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("configures filterable fields and waits for Meilisearch document tasks", async () => {
    const calls: { init?: RequestInit; url: string }[] = [];
    const writer = createMeiliSearchIndexWriter({
      apiKey: "local-key",
      host: "http://meili.test",
      taskPollIntervalMs: 0,
      fetcher: async (url, init) => {
        calls.push({
          ...(init === undefined ? {} : { init }),
          url: String(url),
        });
        if (calls.length === 1) {
          return Response.json({ taskUid: 1 });
        }
        if (calls.length === 2) {
          return Response.json({ status: "succeeded" });
        }
        if (calls.length === 3) {
          return Response.json({ taskUid: 2 });
        }

        return Response.json({ status: "succeeded" });
      },
    });

    await writer.indexDocuments({
      documents: [
        createSearchIndexDocument({
          chunkId: "chunk_1",
          chunkIndex: 0,
          content: "Chunk body",
          documentId: "doc_1",
          documentVersion: 1,
          knowledgeBaseId: "kb_1",
          metadata: {},
          sourceLocator: null,
          tenantId: "tenant_1",
        }),
      ],
    });

    expect(calls.map((call) => `${call.init?.method ?? "GET"} ${call.url}`)).toEqual([
      "PUT http://meili.test/indexes/kb_chunks/settings/filterable-attributes",
      "GET http://meili.test/tasks/1",
      "POST http://meili.test/indexes/kb_chunks/documents?primaryKey=id",
      "GET http://meili.test/tasks/2",
    ]);
  });

  it("fails search indexing when Meilisearch reports a failed task", async () => {
    const writer = createMeiliSearchIndexWriter({
      apiKey: "local-key",
      host: "http://meili.test",
      taskPollIntervalMs: 0,
      fetcher: async (url, init) => {
        if (String(url).includes("/settings/")) {
          return Response.json({ taskUid: 1 });
        }
        if (String(url).endsWith("/tasks/1")) {
          return Response.json({ status: "succeeded" });
        }
        if (init?.method === "POST") {
          return Response.json({ taskUid: 2 });
        }

        return Response.json({
          status: "failed",
          error: { message: "primary key inference failed" },
        });
      },
    });

    await expect(
      writer.indexDocuments({
        documents: [
          createSearchIndexDocument({
            chunkId: "chunk_1",
            chunkIndex: 0,
            content: "Chunk body",
            documentId: "doc_1",
            documentVersion: 1,
            knowledgeBaseId: "kb_1",
            metadata: {},
            sourceLocator: null,
            tenantId: "tenant_1",
          }),
        ],
      }),
    ).rejects.toThrow("Search index task failed");
  });
});
